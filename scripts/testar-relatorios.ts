import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { comCliente } from "../src/lib/db";
import { textoDoHtml } from "../src/lib/pdf/html";
import { fecharNavegador, gerarPdf } from "../src/lib/pdf/navegador";
import { ErroAcessoRelatorio, montarDocumento, type ContextoRelatorio, type RelatorioMontado } from "../src/lib/relatorios/comum";
import { montarRelatorioAutoavaliacao } from "../src/lib/relatorios/autoavaliacao";
import { montarRelatorioDemandas } from "../src/lib/relatorios/demandas";
import { montarRelatorioAlertas } from "../src/lib/relatorios/alertas";
import { montarRelatorioAuditoria, versaoEfetiva } from "../src/lib/relatorios/auditoria";
import { montarRelatorioAnual } from "../src/lib/relatorios/anual";
import { montarOficioDemanda } from "../src/lib/relatorios/oficio";
import { escapar, html } from "../src/lib/pdf/html";
import { aplicarVariaveis, secoesEfetivas, somentePersonalizadas, TEXTO_BASE_ANUAL } from "../src/lib/relatorios/anual-padrao";

// Gera cada relatório em PDF a partir do seed (montagem direta, com o contexto de RLS da aplicação),
// confere textos-chave no HTML, a assinatura %PDF e o número de páginas, e o bloqueio do satélite.
// Requer migrações + seed e o Chromium do Playwright (npx playwright install chromium).
// Rodar com a condição react-server (ver npm run test:relatorios) por causa do "server-only".
// Os PDFs ficam em tmp/relatorios/ (pasta ignorada pelo git).

const dono = new Client({ connectionString: process.env.DATABASE_URL });
const SAIDA = path.resolve("tmp", "relatorios");
const ANO_TESTE = new Date().getFullYear();
let falhas = 0;

function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

function contarPaginas(pdf: Buffer) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
}

async function gerarEConferir(ctx: ContextoRelatorio, rel: RelatorioMontado | null, chaves: string[], arquivo: string) {
  conferir(`${arquivo}: relatório montado`, !!rel);
  if (!rel) return;
  const doc = await montarDocumento(ctx, rel);
  const texto = textoDoHtml(doc.html);
  for (const chave of chaves) conferir(`${arquivo}: contém "${chave}"`, texto.includes(chave));
  conferir(`${arquivo}: cabeçalho com o nome da entidade`, doc.cabecalho.includes("Prefeitura Municipal de Exemplo"));
  conferir(`${arquivo}: rodapé com paginação e emissor`, doc.rodape.includes("totalPages") && doc.rodape.includes(escapar(ctx.usuarioNome)));
  const pdf = await gerarPdf(doc.html, { cabecalho: doc.cabecalho, rodape: doc.rodape, paisagem: rel.paisagem });
  const paginas = contarPaginas(pdf);
  conferir(`${arquivo}: arquivo começa com %PDF`, pdf.subarray(0, 4).toString("latin1") === "%PDF");
  conferir(`${arquivo}: ${paginas} página(s)`, paginas > 0);
  await writeFile(path.join(SAIDA, `${arquivo}.pdf`), pdf);
}

async function lancaAcesso(fn: () => Promise<unknown>) {
  try {
    await fn();
    return false;
  } catch (err) {
    return err instanceof ErroAcessoRelatorio;
  }
}

function regrasPuras() {
  conferir("html: valores interpolados são escapados", html`<p>${"<script>&"}</p>`.valor === "<p>&lt;script&gt;&amp;</p>");
  conferir("html: trechos aninhados não são escapados de novo", html`<div>${html`<b>${"a<b"}</b>`}</div>`.valor === "<div><b>a&lt;b</b></div>");
  conferir("auditoria: antes do relatório final a versão é sempre preliminar", versaoEfetiva("EXECUCAO", "final") === "preliminar");
  conferir("auditoria: no relatório final, padrão é a versão final", versaoEfetiva("RELATORIO_FINAL") === "final");
  conferir("auditoria: no relatório final, a preliminar ainda pode ser pedida", versaoEfetiva("ENCERRADA", "preliminar") === "preliminar");

  const vars = { entidade: "Prefeitura X", municipio: "Abaíra", uf: "BA", ano: "2026", ano_seguinte: "2027" };
  conferir("anual: variáveis substituídas, desconhecidas preservadas", aplicarVariaveis("{entidade} {ano} {xyz}", vars) === "Prefeitura X 2026 {xyz}");
  const ef = secoesEfetivas({ conclusao: "Do ano" }, { apresentacao: "Do padrão" });
  conferir("anual: prioridade ano > padrão do cliente > texto-base", ef.conclusao.origem === "ano" && ef.apresentacao.origem === "padrao" && ef.metas.texto === TEXTO_BASE_ANUAL.metas);
  const so = somentePersonalizadas({ apresentacao: "Do padrão\r\n", conclusao: "Outro", metas: TEXTO_BASE_ANUAL.metas }, { apresentacao: "Do padrão" });
  conferir("anual: só grava no exercício as seções diferentes do padrão", JSON.stringify(Object.keys(so)) === '["conclusao"]');
}

async function main() {
  regrasPuras();
  await mkdir(SAIDA, { recursive: true });
  await dono.connect();

  // Clientes do seed (o banco pode ter também os dados de demonstração): os mais antigos de cada tipo.
  const { rows: clientes } = await dono.query("SELECT id, tipo FROM clientes ORDER BY criado_em");
  const pm = clientes.find((c) => c.tipo === "PREFEITURA")!.id as string;
  const cm = clientes.find((c) => c.tipo === "CAMARA")!.id as string;
  const { rows: us } = await dono.query("SELECT id, email FROM usuarios");
  const controlador = us.find((u) => u.email.startsWith("controlador"))!.id as string;
  const satelite = us.find((u) => u.email.startsWith("saude"))!.id as string;
  const ctx: ContextoRelatorio = { clienteId: pm, usuarioId: controlador, perfil: "CONTROLADOR", usuarioNome: "Controlador de Teste" };
  const ctxSat: ContextoRelatorio = { clienteId: pm, usuarioId: satelite, perfil: "SATELITE", usuarioNome: "Satélite de Teste" };

  const { rows: ciclos } = await dono.query("SELECT id, nome FROM ciclos_avaliacao WHERE cliente_id = $1 ORDER BY data_inicio DESC LIMIT 1", [pm]);
  const { rows: dems } = await dono.query(
    "SELECT d.id, d.assunto, u.nome AS unidade FROM demandas d JOIN unidades u ON u.id = d.unidade_destino_id WHERE d.cliente_id = $1 ORDER BY d.criado_em DESC LIMIT 1",
    [pm],
  );
  const { rows: un } = await dono.query("SELECT id FROM unidades WHERE cliente_id = $1 AND sigla = 'SESAU' LIMIT 1", [pm]);
  const sesau = un[0].id as string;

  // Auditoria temporária com matriz, achado e recomendação (o seed não tem auditorias).
  const { rows: aud } = await dono.query(
    `INSERT INTO auditorias (id, cliente_id, numero, ano, titulo, tipo, objetivo, escopo, criterios, unidade_id, status, criado_por_id, atualizado_em)
     VALUES (gen_random_uuid(), $1, 990101, 1999, 'Auditoria de teste dos relatórios', 'CONFORMIDADE', 'Verificar a regularidade dos pagamentos',
       'Pagamentos do 1º semestre', 'Lei 14.133/2021', $2, 'PLANEJAMENTO', $3, now()) RETURNING id`,
    [pm, sesau, controlador],
  );
  const idAuditoria = aud[0].id as string;
  await dono.query(
    `INSERT INTO questoes_auditoria (id, cliente_id, auditoria_id, ordem, questao, informacoes, fontes, procedimentos)
     VALUES (gen_random_uuid(), $1, $2, 1, 'Os pagamentos seguem a ordem cronológica?', 'Lista de pagamentos', 'Sistema contábil', 'Amostragem')`,
    [pm, idAuditoria],
  );
  const { rows: ach } = await dono.query(
    `INSERT INTO achados (id, cliente_id, auditoria_id, numero, titulo, condicao, criterio, causa, efeito, probabilidade, impacto, criado_por_id, atualizado_em)
     VALUES (gen_random_uuid(), $1, $2, 1, 'Quebra da ordem cronológica', 'Pagamentos fora de ordem', 'Art. 141 da Lei 14.133/2021',
       'Ausência de controle', 'Risco de favorecimento', 4, 4, $3, now()) RETURNING id`,
    [pm, idAuditoria, controlador],
  );
  await dono.query(
    `INSERT INTO recomendacoes (id, cliente_id, achado_id, numero, texto, unidade_id, criado_por_id)
     VALUES (gen_random_uuid(), $1, $2, 1, 'Implantar controle da ordem cronológica de pagamentos', $3, $4)`,
    [pm, ach[0].id, sesau, controlador],
  );

  // Textos do relatório anual: cria só se o ano ainda não tiver relatório (e remove ao final).
  const { rows: existente } = await dono.query("SELECT 1 FROM relatorios_anuais WHERE cliente_id = $1 AND ano = $2", [pm, ANO_TESTE]);
  const criouAnual = existente.length === 0;
  // Texto padrão do cliente: o teste usa um temporário (restaurado ao final) para conferir a herança no PDF.
  const { rows: modeloAntes } = await dono.query("SELECT secoes FROM modelos_relatorio_anual WHERE cliente_id = $1", [pm]);
  await comCliente(ctx, (tx) =>
    tx.modeloRelatorioAnual.upsert({
      where: { clienteId: pm },
      create: { clienteId: pm, secoes: { conclusao: "Conclusão padrão de {entidade} para {ano}." } },
      update: { secoes: { conclusao: "Conclusão padrão de {entidade} para {ano}." } },
    }),
  );
  if (criouAnual) {
    await comCliente(ctx, (tx) =>
      tx.relatorioAnual.create({
        data: { clienteId: pm, ano: ANO_TESTE, secoes: { apresentacao: "Texto de apresentação do teste automatizado." }, atualizadoPorId: controlador },
      }),
    );
  }

  try {
    if (ciclos.length) {
      await gerarEConferir(
        ctx,
        await montarRelatorioAutoavaliacao(ctx, { cicloId: ciclos[0].id }),
        ["Relatório da Autoavaliação", ciclos[0].nome, "Conformidade por capítulo", "Conformidade por macrofunção", "Plano de ação (5W2H)"],
        "autoavaliacao",
      );
      const outroCliente = await montarRelatorioAutoavaliacao({ ...ctx, clienteId: cm }, { cicloId: ciclos[0].id });
      conferir("autoavaliação: ciclo de outro cliente não é encontrado (RLS)", outroCliente === null);
    } else {
      conferir("seed tem ciclo de autoavaliação", false);
    }

    await gerarEConferir(
      ctx,
      await montarRelatorioDemandas(ctx, {}),
      ["Relatório de Demandas", "Resultado por unidade", "Tempo médio", ...(dems[0] ? [dems[0].unidade as string] : [])],
      "demandas",
    );
    const soSesau = await montarRelatorioDemandas(ctx, { unidadeId: sesau, inicio: new Date("2000-01-01T00:00:00Z") });
    conferir("demandas: filtro por unidade aparece no relatório", textoDoHtml(soSesau.corpo.valor).includes("Secretaria"));

    await gerarEConferir(ctx, await montarRelatorioAlertas(ctx, {}), ["Painel de Alertas", "Matriz de gravidade", "Situações por gravidade"], "alertas");

    const relAud = await montarRelatorioAuditoria(ctx, { auditoriaId: idAuditoria, versao: "final" });
    conferir("auditoria: antes do relatório final sai como preliminar com marca d'água", relAud?.marcaDagua === "PRELIMINAR");
    await gerarEConferir(
      ctx,
      relAud,
      ["Relatório Preliminar de Auditoria", "Matriz de planejamento", "Quebra da ordem cronológica", "Condição", "Critério", "Causa", "Efeito", "Implantar controle da ordem cronológica"],
      "auditoria-preliminar",
    );

    await gerarEConferir(
      ctx,
      await montarRelatorioAnual(ctx, { ano: ANO_TESTE }),
      [`Relatório Anual de Controle Interno — Exercício ${ANO_TESTE}`, "Autoavaliação do controle interno", "Auditorias realizadas", "Demandas às unidades", ...(criouAnual
          ? ["Texto de apresentação do teste automatizado.", "Conclusão padrão de Prefeitura Municipal de Exemplo para " + ANO_TESTE + ".", "Plano Plurianual (PPA)"]
          : [])],
      "relatorio-anual",
    );

    if (dems[0]) {
      await gerarEConferir(ctx, await montarOficioDemanda(ctx, { demandaId: dems[0].id }), ["Ofício CI nº", dems[0].assunto, "Atenciosamente"], "oficio");
    }

    // Satélite: bloqueado na montagem e, por baixo, pela RLS.
    conferir("satélite: relatório de demandas recusado", await lancaAcesso(() => montarRelatorioDemandas(ctxSat, {})));
    conferir("satélite: painel de medidas recusado", await lancaAcesso(() => montarRelatorioAlertas(ctxSat, {})));
    conferir("satélite: relatório de auditoria recusado", await lancaAcesso(() => montarRelatorioAuditoria(ctxSat, { auditoriaId: idAuditoria })));
    conferir("satélite: relatório anual recusado", await lancaAcesso(() => montarRelatorioAnual(ctxSat, { ano: ANO_TESTE })));
    if (ciclos[0]) conferir("satélite: autoavaliação recusada", await lancaAcesso(() => montarRelatorioAutoavaliacao(ctxSat, { cicloId: ciclos[0].id })));
    if (dems[0]) conferir("satélite: ofício recusado", await lancaAcesso(() => montarOficioDemanda(ctxSat, { demandaId: dems[0].id })));
    const rls = await comCliente(ctxSat, async (tx) => ({
      auditorias: await tx.auditoria.count(),
      situacoes: await tx.situacao.count(),
      anuais: await tx.relatorioAnual.count(),
      modelos: await tx.modeloRelatorioAnual.count(),
    }));
    conferir("satélite (RLS): não lê o texto padrão do relatório anual", rls.modelos === 0);
    const modeloOutro = await comCliente({ ...ctx, clienteId: cm }, (tx) => tx.modeloRelatorioAnual.count({ where: { clienteId: pm } }));
    conferir("outro cliente (RLS): não lê o texto padrão da prefeitura", modeloOutro === 0);
    conferir("satélite (RLS): não lê auditorias", rls.auditorias === 0);
    conferir("satélite (RLS): não lê situações", rls.situacoes === 0);
    conferir("satélite (RLS): não lê relatórios anuais", rls.anuais === 0);
    let gravou = true;
    try {
      await comCliente(ctxSat, (tx) => tx.relatorioAnual.createMany({ data: [{ clienteId: pm, ano: 2001 }] }));
    } catch {
      gravou = false;
    }
    conferir("satélite (RLS): não grava relatório anual", !gravou);
    const outro = await comCliente({ ...ctx, clienteId: cm }, (tx) => tx.relatorioAnual.count({ where: { clienteId: pm } }));
    conferir("outro cliente (RLS): não lê o relatório anual da prefeitura", outro === 0);
  } finally {
    await dono.query("DELETE FROM auditorias WHERE id = $1", [idAuditoria]);
    await dono.query("DELETE FROM relatorios_anuais WHERE cliente_id = $1 AND ano = 2001", [pm]);
    if (criouAnual) await dono.query("DELETE FROM relatorios_anuais WHERE cliente_id = $1 AND ano = $2", [pm, ANO_TESTE]);
    if (modeloAntes.length) await dono.query("UPDATE modelos_relatorio_anual SET secoes = $2 WHERE cliente_id = $1", [pm, modeloAntes[0].secoes]);
    else await dono.query("DELETE FROM modelos_relatorio_anual WHERE cliente_id = $1", [pm]);
    await dono.end();
    await fecharNavegador();
  }

  console.log(`\nPDFs gerados em ${SAIDA}`);
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await fecharNavegador().catch(() => {});
  process.exit(1);
});
