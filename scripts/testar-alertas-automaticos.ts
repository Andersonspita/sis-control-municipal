import "dotenv/config";
import assert from "node:assert/strict";
import { Client } from "pg";
import { comCliente, db, type ContextoCliente } from "../src/lib/db";
import { aplicarAlertasAutomaticos } from "../src/lib/integracoes/alertas-automaticos";
import { mensagensAlertasAutomaticos } from "../src/lib/email/alertas";
import { executarSincronizacao } from "../src/lib/integracoes/sincronizar";
import type { Buscador } from "../src/lib/integracoes/http";
import type { DadosSiconfi, EntregaSiconfi } from "../src/lib/integracoes/tipos";

// Alertas automáticos contra o banco: criação sem autor, idempotência, atualização, encerramento automático,
// respeito ao encerramento manual, regra da Câmara, RLS do satélite e e-mail aos controladores.
// Requer migrações + seed. Rodar com a condição react-server (npm run test:alertas-automaticos).
// Usa a Prefeitura e a Câmara do seed (sem código IBGE, então sem alertas reais) e apaga o que criou.

const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

async function caso(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`OK    ${nome}`);
  } catch (err) {
    falhas++;
    console.log(`FALHA ${nome}\n      ${err instanceof Error ? err.message : err}`);
  }
}

const entrega = (periodo: number): EntregaSiconfi => ({
  sigla: "RGF",
  entregavel: "Relatório de Gestão Fiscal",
  exercicio: 2026,
  periodicidade: "Q",
  periodo,
  rotuloPeriodo: `${periodo}º quadrimestre/2026`,
  prazo: "2026-09-30",
  entregueEm: null,
  situacao: "PENDENTE",
});

function dados(p: Partial<DadosSiconfi> = {}): DadosSiconfi {
  return {
    exercicio: 2026,
    poder: "E",
    instituicao: "Prefeitura de teste",
    rcl: null,
    pessoal: { valor: 1_000_000, percentual: 52, faixa: "PRUDENCIAL", referencia: "RGF 1º quadrimestre/2026" },
    divida: null,
    resultadoPrimario: null,
    execucao: null,
    entregas: [entrega(2)],
    avisos: [],
    ...p,
  };
}

async function main() {
  await dono.connect();
  const { rows: clientes } = await dono.query("SELECT id, tipo, nome, cnpj, municipio FROM clientes ORDER BY criado_em");
  const pm = clientes.find((c) => c.tipo === "PREFEITURA")!;
  const cm = clientes.find((c) => c.tipo === "CAMARA")!;
  const { rows: us } = await dono.query("SELECT id, email FROM usuarios ORDER BY criado_em");
  const controlador = us.find((u) => u.email.startsWith("controlador"))!.id as string;
  const satelite = us.find((u) => u.email.startsWith("saude"))!.id as string;
  const ctx: ContextoCliente = { clienteId: pm.id, usuarioId: controlador, perfil: "CONTROLADOR" };
  const ctxCm: ContextoCliente = { ...ctx, clienteId: cm.id };
  const limpar = async () => {
    await dono.query("DELETE FROM situacoes WHERE cliente_id = ANY($1) AND chave_automatica IS NOT NULL", [[pm.id, cm.id]]);
    await dono.query("DELETE FROM coletas_integracao WHERE cliente_id = ANY($1)", [[pm.id, cm.id]]);
  };
  await limpar();

  const aplicar = (d: DadosSiconfi, c = ctx, poder: "E" | "L" = "E") =>
    comCliente(c, (tx) => aplicarAlertasAutomaticos(tx, { clienteId: c.clienteId, entidade: "Entidade de teste", poder, dados: d, usuarioId: null }));
  const situacao = async (chave: string) =>
    (await dono.query("SELECT * FROM situacoes WHERE cliente_id = $1 AND chave_automatica = $2 ORDER BY criado_em DESC LIMIT 1", [pm.id, chave])).rows[0];

  try {
    await caso("cria um alerta por indicador, sem autor, com origem ALERTA e numeração sequencial", async () => {
      const r = await aplicar(dados());
      assert.deepEqual(r.criados.map((c) => c.chave).sort(), ["entregas", "pessoal"]);
      const s = await situacao("pessoal");
      assert.equal(s.origem, "ALERTA");
      assert.equal(s.criado_por_id, null);
      assert.equal(s.status, "ABERTA");
      assert.equal(s.probabilidade, 4);
      assert.notEqual(r.criados[0].numero, r.criados[1].numero);
      const { rows: logs } = await dono.query("SELECT 1 FROM log_auditoria WHERE entidade_id = $1 AND acao = 'situacao.criada_automaticamente'", [s.id]);
      assert.equal(logs.length, 1);
    });

    await caso("nova coleta com os mesmos dados não duplica nem altera", async () => {
      const r = await aplicar(dados());
      assert.equal(r.criados.length + r.atualizados.length + r.encerrados.length, 0);
    });

    await caso("piora da faixa atualiza a gravidade do alerta aberto", async () => {
      const r = await aplicar(dados({ pessoal: { valor: 1_200_000, percentual: 55, faixa: "EXCEDIDO", referencia: "RGF 1º quadrimestre/2026" } }));
      assert.deepEqual(r.atualizados.map((a) => a.chave), ["pessoal"]);
      const s = await situacao("pessoal");
      assert.equal(s.probabilidade, 5);
      assert.equal(s.impacto, 5);
    });

    await caso("entrega regularizada encerra o alerta automaticamente, com justificativa", async () => {
      const r = await aplicar(dados({ pessoal: { valor: 1_200_000, percentual: 55, faixa: "EXCEDIDO", referencia: "RGF 1º quadrimestre/2026" }, entregas: [] }));
      assert.deepEqual(r.encerrados.map((a) => a.chave), ["entregas"]);
      const s = await situacao("entregas");
      assert.equal(s.status, "RESOLVIDA");
      assert.equal(s.encerrado_por_id, null);
      assert.match(s.justificativa_encerramento, /^Encerrado automaticamente/);
    });

    await caso("alerta encerrado pelo controlador não é recriado no mesmo período, mas volta no período seguinte", async () => {
      const s = await situacao("pessoal");
      await dono.query(
        "UPDATE situacoes SET status = 'RESOLVIDA', encerrado_por_id = $2, encerrado_em = now(), justificativa_encerramento = 'Tratado pela controladoria' WHERE id = $1",
        [s.id, controlador],
      );
      const mesmo = await aplicar(dados({ pessoal: { valor: 1_200_000, percentual: 55, faixa: "EXCEDIDO", referencia: "RGF 1º quadrimestre/2026" }, entregas: [] }));
      assert.equal(mesmo.criados.length, 0);
      const seguinte = await aplicar(dados({ pessoal: { valor: 1_200_000, percentual: 55, faixa: "EXCEDIDO", referencia: "RGF 2º quadrimestre/2026" }, entregas: [] }));
      assert.deepEqual(seguinte.criados.map((c) => c.chave), ["pessoal"]);
    });

    await caso("índice parcial impede dois alertas automáticos abertos para o mesmo indicador", async () => {
      const s = await situacao("pessoal");
      await assert.rejects(
        dono.query(
          `INSERT INTO situacoes (id, cliente_id, numero, ano, titulo, descricao, origem, probabilidade, impacto, chave_automatica, atualizado_em)
           VALUES (gen_random_uuid(), $1, 999, 2026, 'dup', 'dup', 'ALERTA', 3, 3, 'pessoal', now())`,
          [s.cliente_id],
        ),
      );
    });

    await caso("Câmara: indicadores do ente (dívida) não viram alerta automático; os do próprio Poder, sim", async () => {
      const r = await aplicar(
        dados({
          poder: "L",
          pessoal: { valor: 1, percentual: 5.8, faixa: "PRUDENCIAL", referencia: "RGF 2º quadrimestre/2026" },
          divida: { consolidada: 1, consolidadaLiquida: 1, percentualDcl: 115, referencia: "RGF 1º quadrimestre/2026 — Executivo municipal" },
          entregas: [],
        }),
        ctxCm,
        "L",
      );
      assert.deepEqual(r.criados.map((c) => c.chave), ["pessoal"]);
    });

    await caso("satélite (RLS) não vê os alertas automáticos", async () => {
      const n = await comCliente({ clienteId: pm.id, usuarioId: satelite, perfil: "SATELITE" }, (tx) => tx.situacao.count({ where: { chaveAutomatica: { not: null } } }));
      assert.equal(n, 0);
    });

    await caso("e-mail dos alertas novos e encerrados vai para controlador e equipe", async () => {
      const resultado = {
        criados: [{ id: "00000000-0000-0000-0000-000000000001", numero: 7, ano: 2026, titulo: "Despesa com pessoal acima do limite", chave: "pessoal", probabilidade: 5, impacto: 5 }],
        atualizados: [],
        encerrados: [],
      };
      const mensagens = await comCliente(ctx, (tx) => mensagensAlertasAutomaticos(tx, pm.id, pm.nome, resultado));
      assert.ok(mensagens.length > 0);
      assert.ok(mensagens.every((m) => m.assunto.includes("novo(s) alerta(s)") && m.texto.includes("007/2026") && m.texto.includes("Crítico")));
      const vazio = await comCliente(ctx, (tx) => mensagensAlertasAutomaticos(tx, pm.id, pm.nome, { criados: [], atualizados: [{ ...resultado.criados[0] }], encerrados: [] }));
      assert.equal(vazio.length, 0);
    });
    await caso("coleta completa (SICONFI simulado) cria os alertas sozinha e avisa por e-mail (Mailpit)", async () => {
      await limpar();
      const json = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { "Content-Type": "application/json" } });
      const pref = "Prefeitura Municipal de Teste - BA";
      const entregas = [2025, 2026].flatMap((ano) =>
        [1, 2, 3].filter((q) => ano === 2025 || q === 1).map((q) => ({ exercicio: ano, instituicao: pref, entregavel: "Relatório de Gestão Fiscal", periodicidade: "Q", periodo: q, data_status: `${ano}-05-25T18:13:55Z` })),
      );
      const linha = (cod_conta: string, coluna: string, valor: number) => ({ cod_conta, coluna, valor, conta: cod_conta, instituicao: pref });
      const buscador = (async (entrada: string | URL | Request) => {
        const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
        if (url.includes("extrato_entregas")) return json({ items: entregas.filter((e) => url.includes(`an_referencia=${e.exercicio}`)), hasMore: false });
        if (url.includes("RGF-Anexo+01"))
          return json({ items: [linha("DespesaComPessoalTotal", "Valor", 5_500_000), linha("DespesaComPessoalTotal", "% sobre a RCL Ajustada", 55.2)], hasMore: false });
        return json({ items: [], hasMore: false });
      }) as Buscador;
      const inicio = new Date();
      const { fontes, alertas } = await executarSincronizacao({
        cliente: { id: pm.id, nome: pm.nome, tipo: "PREFEITURA", cnpj: pm.cnpj, municipio: pm.municipio, codigoIbge: "2999999" },
        executar: (fn) => comCliente(ctx, fn),
        usuarioId: null,
        origem: "AGENDADA",
        hoje: "2026-10-05",
        buscador,
      });
      assert.equal(fontes.SICONFI.status, "SUCESSO");
      assert.deepEqual(alertas?.criados.map((c) => c.chave).sort(), ["entregas", "pessoal"]);
      // O e-mail vai pelo SMTP de desenvolvimento (Mailpit, docker compose); confere se chegou.
      await new Promise((r) => setTimeout(r, 1500));
      const caixa = (await (await fetch("http://localhost:8025/api/v1/messages?limit=20")).json()) as { messages: { Subject: string; Created: string }[] };
      assert.ok(
        caixa.messages.some((m) => m.Subject.includes("novo(s) alerta(s)") && m.Subject.includes(pm.nome) && new Date(m.Created) >= new Date(inicio.getTime() - 1000)),
        "e-mail dos alertas não encontrado no Mailpit",
      );
    });
  } finally {
    await limpar();
    await dono.end();
    await db.$disconnect();
  }

  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  if (falhas) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
