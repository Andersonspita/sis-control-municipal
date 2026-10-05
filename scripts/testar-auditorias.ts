import "dotenv/config";
import { Client } from "pg";
import type { StatusAuditoria } from "../src/generated/prisma/browser";
import { numeroAuditoria, ordenarPorRisco, periodoPrevisto, TRANSICOES_AUDITORIA, transicaoPermitida } from "../src/lib/auditorias";

// Regras puras das auditorias + ciclo de status, aplicação de checklist e geração de ações no banco.
// Tudo roda em transações desfeitas ao final (requer migrações e seed).
// Uso: npm run test:auditorias

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

const STATUS = Object.keys(TRANSICOES_AUDITORIA) as StatusAuditoria[];

function regrasPuras() {
  conferir("número da auditoria com três dígitos", numeroAuditoria(7, 2026) === "007/2026");
  conferir("período previsto de um mês só", periodoPrevisto(3, 3) === "mar");
  conferir("período previsto de vários meses", periodoPrevisto(2, 4) === "fev–abr");
  const ordem = ordenarPorRisco([
    { id: "a", probabilidade: 2, impacto: 2, mesInicio: 1 },
    { id: "b", probabilidade: 5, impacto: 4, mesInicio: 6 },
    { id: "c", probabilidade: 4, impacto: 5, mesInicio: 2 },
    { id: "d", probabilidade: 4, impacto: 5, mesInicio: 1 },
  ]).map((i) => i.id);
  conferir("PAAI: maior risco primeiro; empate pelo impacto e depois pelo mês", ordem.join() === "d,c,b,a");
  conferir("ciclo: planejamento → execução", transicaoPermitida("PLANEJAMENTO", "EXECUCAO"));
  conferir("ciclo: não pula do planejamento para o relatório final", !transicaoPermitida("PLANEJAMENTO", "RELATORIO_FINAL"));
  conferir("ciclo: encerrada e cancelada são finais", TRANSICOES_AUDITORIA.ENCERRADA.length === 0 && TRANSICOES_AUDITORIA.CANCELADA.length === 0);
  conferir(
    "ciclo: toda etapa não final pode ser cancelada",
    STATUS.filter((s) => s !== "ENCERRADA" && s !== "CANCELADA").every((s) => transicaoPermitida(s, "CANCELADA")),
  );
}

async function garantiasNoBanco() {
  const app = new Client({ connectionString: process.env.APP_DATABASE_URL });
  const dono = new Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  await dono.connect();

  const { rows: cl } = await dono.query("SELECT id FROM clientes WHERE tipo = 'PREFEITURA' LIMIT 1");
  const cliente = cl[0].id as string;
  const { rows: us } = await dono.query("SELECT id FROM usuarios WHERE email LIKE 'controlador%' LIMIT 1");
  const controlador = us[0].id as string;
  const { rows: un } = await dono.query("SELECT id FROM unidades WHERE cliente_id = $1 AND sigla = 'SESAU' LIMIT 1", [cliente]);
  const sesau = un[0]?.id as string | undefined;

  async function comContexto(fn: () => Promise<void>) {
    await app.query("BEGIN");
    try {
      await app.query(
        "SELECT set_config('app.cliente_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.perfil', 'CONTROLADOR', true)",
        [cliente, controlador],
      );
      await fn();
    } finally {
      await app.query("ROLLBACK");
    }
  }

  async function falha(sql: string, params: unknown[] = []) {
    await app.query("SAVEPOINT s");
    try {
      await app.query(sql, params);
      await app.query("RELEASE SAVEPOINT s");
      return false;
    } catch {
      await app.query("ROLLBACK TO SAVEPOINT s");
      return true;
    }
  }

  let seq = 990100;
  async function novaAuditoria(status: StatusAuditoria = "PLANEJAMENTO") {
    const { rows } = await app.query(
      `INSERT INTO auditorias (id, cliente_id, numero, ano, titulo, tipo, objetivo, unidade_id, equipe_ids, criado_por_id, atualizado_em)
       VALUES (gen_random_uuid(), $1, $2, 1999, 'Auditoria de teste', 'CONFORMIDADE', 'Objetivo de teste', $3, ARRAY[$4::uuid], $4, now()) RETURNING id`,
      [cliente, seq++, sesau ?? null, controlador],
    );
    const id = rows[0].id as string;
    // Percorre o ciclo pelo caminho principal até a etapa pedida.
    const caminho: StatusAuditoria[] = ["EXECUCAO", "RELATORIO_PRELIMINAR", "MANIFESTACAO", "RELATORIO_FINAL", "MONITORAMENTO"];
    for (const s of caminho.slice(0, caminho.indexOf(status) + 1)) {
      await app.query("UPDATE auditorias SET status = $2 WHERE id = $1", [id, s]);
    }
    return id;
  }

  // Transições: a tabela da aplicação e a função do banco devem concordar em todos os pares.
  await comContexto(async () => {
    const { rows } = await app.query(
      `SELECT de::text, para::text, auditoria_transicao_valida(de, para) AS ok
         FROM unnest(enum_range(NULL::"StatusAuditoria")) de, unnest(enum_range(NULL::"StatusAuditoria")) para
        WHERE de <> para`,
    );
    const divergentes = rows.filter((r) => r.ok !== transicaoPermitida(r.de, r.para));
    conferir(`transições: aplicação e banco concordam nos ${rows.length} pares`, rows.length > 0 && divergentes.length === 0);
    for (const d of divergentes.slice(0, 5)) console.log(`      divergente: ${d.de} → ${d.para} (banco: ${d.ok})`);

    conferir(
      "trigger: auditoria nova precisa começar no planejamento",
      await falha(
        `INSERT INTO auditorias (id, cliente_id, numero, ano, titulo, tipo, objetivo, status, criado_por_id, atualizado_em)
         VALUES (gen_random_uuid(), $1, 990099, 1999, 'x', 'ESPECIAL', 'x', 'EXECUCAO', $2, now())`,
        [cliente, controlador],
      ),
    );
    const id = await novaAuditoria();
    conferir("trigger: planejamento não salta para o relatório final", await falha("UPDATE auditorias SET status = 'RELATORIO_FINAL' WHERE id = $1", [id]));
    conferir("trigger: planejamento → execução é aceito", !(await falha("UPDATE auditorias SET status = 'EXECUCAO' WHERE id = $1", [id])));
    conferir("trigger: execução pode voltar ao planejamento", !(await falha("UPDATE auditorias SET status = 'PLANEJAMENTO' WHERE id = $1", [id])));
    conferir("CHECK: cancelar exige justificativa", await falha("UPDATE auditorias SET status = 'CANCELADA' WHERE id = $1", [id]));
    conferir(
      "cancelamento com justificativa é aceito",
      !(await falha("UPDATE auditorias SET status = 'CANCELADA', justificativa_cancelamento = 'Teste' WHERE id = $1", [id])),
    );
    conferir("trigger: auditoria cancelada não reabre", await falha("UPDATE auditorias SET status = 'PLANEJAMENTO' WHERE id = $1", [id]));

    const fim = await novaAuditoria("MONITORAMENTO");
    conferir("ciclo completo até encerrada", !(await falha("UPDATE auditorias SET status = 'ENCERRADA' WHERE id = $1", [fim])));
    conferir("trigger: auditoria encerrada não volta ao monitoramento", await falha("UPDATE auditorias SET status = 'MONITORAMENTO' WHERE id = $1", [fim]));
  });

  // Checklists: aplicar copia os itens do modelo; mudar o modelo depois não altera a cópia.
  await comContexto(async () => {
    const { rows: m } = await app.query(
      `INSERT INTO modelos_checklist (id, cliente_id, nome, atualizado_em) VALUES (gen_random_uuid(), $1, 'Modelo de teste 1999', now()) RETURNING id`,
      [cliente],
    );
    const modelo = m[0].id as string;
    await app.query(
      `INSERT INTO itens_checklist (id, cliente_id, modelo_id, ordem, texto)
       SELECT gen_random_uuid(), $1, $2, n, 'Item ' || n FROM generate_series(1, 3) n`,
      [cliente, modelo],
    );
    const { rows: v } = await app.query(
      `INSERT INTO modelos_checklist (id, cliente_id, nome, atualizado_em) VALUES (gen_random_uuid(), $1, 'Modelo vazio 1999', now()) RETURNING id`,
      [cliente],
    );
    const vazio = v[0].id as string;

    const id = await novaAuditoria();
    const { rows: ap } = await app.query("SELECT auditoria_aplicar_checklist($1, $2, $3) AS id", [id, modelo, controlador]);
    const checklist = ap[0].id as string;
    const { rows: itens } = await app.query(
      "SELECT texto, ordem, resultado FROM itens_checklist_auditoria WHERE checklist_id = $1 ORDER BY ordem",
      [checklist],
    );
    conferir("checklist: aplicar copia todos os itens do modelo", itens.length === 3);
    conferir("checklist: itens copiados em ordem e sem resultado", itens.map((i) => i.texto).join() === "Item 1,Item 2,Item 3" && itens.every((i) => i.resultado === null));
    await app.query("UPDATE itens_checklist SET texto = 'Alterado' WHERE modelo_id = $1", [modelo]);
    const { rows: copia } = await app.query("SELECT count(*)::int AS n FROM itens_checklist_auditoria WHERE checklist_id = $1 AND texto = 'Alterado'", [checklist]);
    conferir("checklist: alterar o modelo não muda o checklist aplicado", copia[0].n === 0);
    conferir("checklist: o mesmo modelo não é aplicado duas vezes", await falha("SELECT auditoria_aplicar_checklist($1, $2, $3)", [id, modelo, controlador]));
    conferir("checklist: modelo sem itens é recusado", await falha("SELECT auditoria_aplicar_checklist($1, $2, $3)", [id, vazio, controlador]));
    await app.query("UPDATE modelos_checklist SET ativo = false WHERE id = $1", [modelo]);
    const outra = await novaAuditoria();
    conferir("checklist: modelo inativo é recusado", await falha("SELECT auditoria_aplicar_checklist($1, $2, $3)", [outra, modelo, controlador]));
    await app.query("UPDATE modelos_checklist SET ativo = true WHERE id = $1", [modelo]);
    const relatorio = await novaAuditoria("RELATORIO_PRELIMINAR");
    conferir("checklist: não se aplica após a execução", await falha("SELECT auditoria_aplicar_checklist($1, $2, $3)", [relatorio, modelo, controlador]));

    const { rows: item } = await app.query("SELECT id FROM itens_checklist_auditoria WHERE checklist_id = $1 LIMIT 1", [checklist]);
    conferir(
      "CHECK: resultado do item exige data da avaliação",
      await falha("UPDATE itens_checklist_auditoria SET resultado = 'CONFORME' WHERE id = $1", [item[0].id]),
    );
    conferir(
      "item avaliado com data é aceito",
      !(await falha("UPDATE itens_checklist_auditoria SET resultado = 'NAO_CONFORME', avaliado_em = now() WHERE id = $1", [item[0].id])),
    );
  });

  // Recomendação → ação: um plano por auditoria, uma ação por recomendação, prioridade pelo risco do achado.
  await comContexto(async () => {
    async function achadoComRecomendacao(auditoria: string, numero: number, probabilidade: number, impacto: number) {
      const { rows: a } = await app.query(
        `INSERT INTO achados (id, cliente_id, auditoria_id, numero, titulo, condicao, criterio, causa, efeito, probabilidade, impacto, criado_por_id, atualizado_em)
         VALUES (gen_random_uuid(), $1, $2, $3, 'Achado de teste', 'cond', 'crit', 'causa', 'efeito', $4, $5, $6, now()) RETURNING id`,
        [cliente, auditoria, numero, probabilidade, impacto, controlador],
      );
      const { rows: r } = await app.query(
        `INSERT INTO recomendacoes (id, cliente_id, achado_id, numero, texto, unidade_id, prazo, criado_por_id)
         VALUES (gen_random_uuid(), $1, $2, 1, 'Recomendação de teste', $3, current_date + 30, $4) RETURNING id`,
        [cliente, a[0].id, sesau ?? null, controlador],
      );
      return r[0].id as string;
    }

    const planejamento = await novaAuditoria();
    const recPlan = await achadoComRecomendacao(planejamento, 1, 3, 3);
    conferir("ação: não é gerada com a auditoria em planejamento", await falha("SELECT * FROM recomendacao_gerar_acao($1, $2)", [recPlan, controlador]));

    const id = await novaAuditoria("EXECUCAO");
    const rec1 = await achadoComRecomendacao(id, 1, 5, 4);
    const rec2 = await achadoComRecomendacao(id, 2, 2, 2);
    const { rows: g1 } = await app.query("SELECT * FROM recomendacao_gerar_acao($1, $2)", [rec1, controlador]);
    conferir("ação: primeira geração cria a ação", g1[0]?.o_criada === true);
    const { rows: plano } = await app.query("SELECT id, origem, status, auditoria_id FROM planos_acao WHERE auditoria_id = $1", [id]);
    conferir("ação: cria o plano da auditoria com origem Auditoria", plano.length === 1 && plano[0].origem === "AUDITORIA" && plano[0].status === "EM_EXECUCAO");
    const { rows: acao } = await app.query("SELECT plano_id, recomendacao_id, prioridade, unidade_responsavel_id FROM acoes WHERE id = $1", [g1[0].o_acao_id]);
    conferir("ação: vinculada à recomendação e ao plano", acao[0]?.recomendacao_id === rec1 && acao[0]?.plano_id === plano[0].id);
    conferir("ação: risco 20 vira prioridade urgente", acao[0]?.prioridade === "URGENTE");
    conferir("ação: unidade responsável vem da recomendação", acao[0]?.unidade_responsavel_id === (sesau ?? null));

    const { rows: g1b } = await app.query("SELECT * FROM recomendacao_gerar_acao($1, $2)", [rec1, controlador]);
    conferir("ação: gerar de novo devolve a mesma ação sem duplicar", g1b[0]?.o_criada === false && g1b[0]?.o_acao_id === g1[0].o_acao_id);
    const { rows: g2 } = await app.query("SELECT * FROM recomendacao_gerar_acao($1, $2)", [rec2, controlador]);
    const { rows: n } = await app.query(
      "SELECT (SELECT count(*) FROM planos_acao WHERE auditoria_id = $1)::int AS planos, (SELECT prioridade FROM acoes WHERE id = $2) AS prioridade",
      [id, g2[0].o_acao_id],
    );
    conferir("ação: segunda recomendação reaproveita o plano da auditoria", n[0].planos === 1 && g2[0].o_plano_id === plano[0].id);
    conferir("ação: risco 4 vira prioridade baixa", n[0].prioridade === "BAIXA");
    conferir(
      "UNIQUE: uma só ação por recomendação",
      await falha(
        `INSERT INTO acoes (id, cliente_id, plano_id, o_que, recomendacao_id, atualizado_em)
         SELECT gen_random_uuid(), cliente_id, plano_id, 'dup', recomendacao_id, now() FROM acoes WHERE id = $1`,
        [g1[0].o_acao_id],
      ),
    );
    conferir(
      "UNIQUE: um só plano por auditoria",
      await falha(
        "INSERT INTO planos_acao (id, cliente_id, auditoria_id, titulo, origem, status, criado_por_id) VALUES (gen_random_uuid(), $1, $2, 'x', 'AUDITORIA', 'EM_EXECUCAO', $3)",
        [cliente, id, controlador],
      ),
    );
    await app.query("UPDATE planos_acao SET status = 'CANCELADO' WHERE id = $1", [plano[0].id]);
    const rec3 = await achadoComRecomendacao(id, 3, 3, 3);
    conferir("ação: plano da auditoria cancelado bloqueia novas ações", await falha("SELECT * FROM recomendacao_gerar_acao($1, $2)", [rec3, controlador]));
  });

  await app.end();
  await dono.end();
}

async function main() {
  regrasPuras();
  await garantiasNoBanco();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
