import "dotenv/config";
import { Client } from "pg";
import {
  calcularConformidade,
  compararGrupos,
  conformidadePorGrupo,
  mapaCapitulos,
  validarResposta,
} from "../src/lib/dados/conformidade";
import { acaoVencida, lerValorMonetario, percentualExecutado } from "../src/lib/dados/acoes";

// Regras puras da autoavaliação e do plano de ação + garantias no banco (requer migrações e seed).
// Uso: npx tsx scripts/testar-autoavaliacao.ts

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

function regrasPuras() {
  const r = calcularConformidade([
    { situacao: "ATENDIDO" },
    { situacao: "PARCIALMENTE_ATENDIDO" },
    { situacao: "NAO_ATENDIDO" },
    { situacao: "NAO_APLICAVEL" },
    { situacao: "NAO_AVALIADO" },
  ]);
  conferir("conformidade: (1 + 0,5 + 0) / 3 = 50%", r.indice === 0.5);
  conferir("conformidade: não se aplica e não avaliado fora do denominador", r.maximo === 3 && r.total === 5);
  conferir("conformidade: avaliados exclui só os não avaliados", r.avaliados === 4);
  conferir("conformidade: sem itens no denominador = null", calcularConformidade([{ situacao: "NAO_APLICAVEL" }]).indice === null);

  const ponderado = calcularConformidade([
    { situacao: "ATENDIDO", peso: 3 },
    { situacao: "NAO_ATENDIDO", peso: 1 },
  ]);
  conferir("conformidade: peso do requisito é respeitado (3/4)", ponderado.indice === 0.75);

  const nos = [
    { id: "I", paiId: null },
    { id: "I.1", paiId: "I" },
    { id: "I.1.a", paiId: "I.1" },
    { id: "II", paiId: null },
  ];
  const caps = mapaCapitulos(nos);
  conferir("capítulo: ancestral de nível superior", caps.get("I.1.a") === "I" && caps.get("II") === "II");

  const itens = [
    { requisitoId: "I.1", situacao: "ATENDIDO" as const },
    { requisitoId: "I.1.a", situacao: "NAO_ATENDIDO" as const },
    { requisitoId: "II", situacao: "PARCIALMENTE_ATENDIDO" as const },
  ];
  const grupos = conformidadePorGrupo(itens, (i) => caps.get(i.requisitoId));
  conferir("por capítulo: I = 50%, II = 50%", grupos.get("I")?.indice === 0.5 && grupos.get("II")?.indice === 0.5);

  const anterior = new Map([["I", { indice: 0.25 }], ["II", { indice: null }]]);
  const evolucao = compararGrupos(grupos, anterior);
  const capI = evolucao.find((e) => e.chave === "I");
  conferir("evolução: +25 p.p. no capítulo I", capI?.variacao === 25);
  conferir("evolução: sem comparação quando o anterior não tem índice", evolucao.find((e) => e.chave === "II")?.variacao === null);

  conferir("justificativa obrigatória para Não atende", validarResposta("NAO_ATENDIDO", " ") !== null);
  conferir("justificativa opcional para Atende", validarResposta("ATENDIDO", "") === null);

  conferir("ação vencida: prazo passado e aberta", acaoVencida({ status: "EM_ANDAMENTO", prazo: "2026-01-01" }, "2026-01-02"));
  conferir("ação não vencida: concluída", !acaoVencida({ status: "CONCLUIDA", prazo: "2026-01-01" }, "2026-01-02"));
  conferir("ação não vencida: prazo hoje", !acaoVencida({ status: "PENDENTE", prazo: new Date("2026-01-02") }, "2026-01-02"));
  conferir(
    "execução do plano: concluída = 100, canceladas fora",
    percentualExecutado([
      { status: "CONCLUIDA", percentual: 0 },
      { status: "EM_ANDAMENTO", percentual: 50 },
      { status: "CANCELADA", percentual: 0 },
    ]) === 75,
  );
  conferir(
    "custo: formatos pt-BR",
    lerValorMonetario("1.234,56") === 1234.56 && lerValorMonetario("R$ 300") === 300 && lerValorMonetario("1.500") === 1500,
  );
  conferir("custo: inválido = null", lerValorMonetario("abc") === null);
}

async function garantiasNoBanco() {
  const app = new Client({ connectionString: process.env.APP_DATABASE_URL });
  const dono = new Client({ connectionString: process.env.DATABASE_URL });
  await app.connect();
  await dono.connect();

  const { rows: ctx } = await dono.query(`
    SELECT c.id AS cliente, u.id AS controlador, s.id AS satelite
      FROM clientes c, usuarios u, usuarios s
     WHERE c.tipo = 'PREFEITURA' AND u.email LIKE 'controlador%' AND s.email LIKE 'saude%'`);
  const { cliente, controlador, satelite } = ctx[0];

  async function comContexto<T>(usuario: string, perfil: string, fn: () => Promise<T>) {
    await app.query("BEGIN");
    try {
      await app.query(
        "SELECT set_config('app.cliente_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.perfil', $3, true)",
        [cliente, usuario, perfil],
      );
      return await fn();
    } finally {
      await app.query("ROLLBACK");
    }
  }

  async function falha(sql: string, params: unknown[] = []) {
    try {
      await app.query("SAVEPOINT s");
      await app.query(sql, params);
      await app.query("RELEASE SAVEPOINT s");
      return false;
    } catch {
      await app.query("ROLLBACK TO SAVEPOINT s");
      return true;
    }
  }

  await comContexto(controlador, "CONTROLADOR", async () => {
    const { rows: concluido } = await app.query(
      "SELECT r.id FROM respostas_requisito r JOIN ciclos_avaliacao c ON c.id = r.ciclo_id WHERE c.status = 'CONCLUIDO' LIMIT 1",
    );
    conferir("seed: há ciclo concluído com respostas", concluido.length === 1);
    if (concluido.length) {
      conferir(
        "trigger: resposta de ciclo concluído não pode ser alterada",
        await falha("UPDATE respostas_requisito SET situacao = 'ATENDIDO' WHERE id = $1", [concluido[0].id]),
      );
    }
    const { rows: ciclo } = await app.query("SELECT id FROM ciclos_avaliacao WHERE status = 'CONCLUIDO' LIMIT 1");
    if (ciclo.length) {
      conferir(
        "trigger: ciclo concluído não volta a ficar em andamento",
        await falha("UPDATE ciclos_avaliacao SET status = 'EM_ANDAMENTO' WHERE id = $1", [ciclo[0].id]),
      );
    }
    const { rows: aberto } = await app.query(
      "SELECT r.id FROM respostas_requisito r JOIN ciclos_avaliacao c ON c.id = r.ciclo_id WHERE c.status = 'EM_ANDAMENTO' LIMIT 1",
    );
    if (aberto.length) {
      conferir(
        "trigger: resposta de ciclo em andamento pode ser alterada",
        !(await falha("UPDATE respostas_requisito SET evidencia = 'teste' WHERE id = $1", [aberto[0].id])),
      );
    }

    const { rows: dup } = await app.query(`
      SELECT resposta_requisito_id FROM acoes WHERE resposta_requisito_id IS NOT NULL
       GROUP BY resposta_requisito_id HAVING count(*) > 1`);
    conferir("plano gerado: no máximo uma ação por requisito respondido", dup.length === 0);

    const { rows: marcos } = await app.query("SELECT count(*)::int AS n FROM marcos_acao");
    conferir("controlador vê os marcos do seu cliente", marcos[0].n > 0);
    conferir(
      "marco com cliente_id de outro cliente é bloqueado",
      await falha(
        "INSERT INTO marcos_acao (id, cliente_id, acao_id, descricao) SELECT gen_random_uuid(), gen_random_uuid(), id, 'x' FROM acoes LIMIT 1",
      ),
    );
  });

  const { rows: esperado } = await dono.query(
    `SELECT count(*)::int AS n FROM marcos_acao m JOIN acoes a ON a.id = m.acao_id
       JOIN unidades u ON u.id = a.unidade_responsavel_id
      WHERE m.cliente_id = $1 AND u.sigla IN ('SESAU', 'REG')`,
    [cliente],
  );
  await comContexto(satelite, "SATELITE", async () => {
    const { rows } = await app.query("SELECT count(*)::int AS n FROM marcos_acao");
    conferir("satélite só vê marcos de ações da sua unidade", rows[0].n === esperado[0].n);
    const { rows: resp } = await app.query("SELECT count(*)::int AS n FROM respostas_requisito");
    conferir("satélite não vê respostas da autoavaliação", resp[0].n === 0);
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
