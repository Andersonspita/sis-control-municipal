import "dotenv/config";
import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { buscarJson, ErroIntegracao, type Buscador } from "../src/lib/integracoes/http";
import { coletarIbge, interpretarAgregado } from "../src/lib/integracoes/ibge";
import { faixaDcl, faixaPessoal, poderDaEntidade } from "../src/lib/integracoes/lrf";
import {
  calcularEntregas,
  coletarSiconfi,
  consultarSiconfi,
  interpretarRgfAnexo01,
  interpretarRgfAnexo02,
  interpretarRreoAnexo06,
  type EntregaBruta,
} from "../src/lib/integracoes/siconfi";
import {
  chavePortal,
  coletarPortalTransparencia,
  consultarSancoes,
  interpretarSancoes,
  resumirConvenios,
  resumirRecursos,
} from "../src/lib/integracoes/portal-transparencia";
import { linksTcmBa } from "../src/lib/integracoes/tcmba";
import { calcularAlertasFiscais } from "../src/lib/integracoes/alertas-fiscais";
import type { DadosSiconfi } from "../src/lib/integracoes/tipos";

// Testes das integrações com APIs públicas.
//   npm run test:integracoes             → só respostas simuladas (parsing, prazos, limites da LRF, paginação, erros)
//   npm run test:integracoes -- --real   → também chama as APIs reais para Abaíra/BA (2900108)

const { values } = parseArgs({ options: { real: { type: "boolean" }, ibge: { type: "string" } } });
let falhas = 0;
let total = 0;

async function caso(nome: string, fn: () => void | Promise<void>) {
  total++;
  try {
    await fn();
    console.log(`OK    ${nome}`);
  } catch (err) {
    falhas++;
    console.log(`FALHA ${nome}\n      ${err instanceof Error ? err.message.split("\n").join("\n      ") : err}`);
  }
}

const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

/** Buscador simulado: a primeira rota cujo trecho aparece na URL responde. Guarda as URLs pedidas. */
function simulado(rotas: [string, (url: URL) => Response | Promise<Response>][]) {
  const pedidas: string[] = [];
  const buscador = (async (entrada: string | URL | Request) => {
    const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
    pedidas.push(url.href);
    const rota = rotas.find(([trecho]) => url.href.includes(trecho));
    if (!rota) return json({ items: [], hasMore: false });
    return rota[1](url);
  }) as Buscador;
  return { buscador, pedidas };
}

// ───────────── Amostras no formato real das APIs (Abaíra/BA, outubro de 2026) ─────────────

const PREF = "Prefeitura Municipal de Abaíra - BA";
const CAM = "Câmara de Vereadores de Abaíra - BA";
const entrega = (instituicao: string, entregavel: string, periodicidade: string, periodo: number, exercicio = 2026): EntregaBruta => ({
  exercicio,
  instituicao,
  entregavel,
  periodicidade,
  periodo,
  data_status: `${exercicio}-05-25T18:13:55Z`,
});
const RREO = "Relatório Resumido de Execução Orçamentária";
const RGF = "Relatório de Gestão Fiscal";
const ENTREGUES: EntregaBruta[] = [
  ...[1, 2, 3, 4].map((b) => entrega(PREF, RREO, "B", b)),
  entrega(PREF, RGF, "Q", 1),
  entrega(CAM, RGF, "Q", 1),
  entrega(CAM, RGF, "Q", 2),
  ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((m) => [entrega(PREF, "MSC Agregada", "M", m), entrega(CAM, "MSC Agregada", "M", m)]),
  // Exercício anterior completo
  ...[1, 2, 3, 4, 5, 6].map((b) => entrega(PREF, RREO, "B", b, 2025)),
  ...[1, 2, 3].flatMap((q) => [entrega(PREF, RGF, "Q", q, 2025), entrega(CAM, RGF, "Q", q, 2025)]),
  ...Array.from({ length: 12 }, (_, i) => [entrega(PREF, "MSC Agregada", "M", i + 1, 2025), entrega(CAM, "MSC Agregada", "M", i + 1, 2025)]).flat(),
  entrega(PREF, "Balanço Anual (DCA)", "A", 1, 2025),
  entrega(PREF, "MSC Encerramento", "A", 1, 2025),
];

const linha = (cod_conta: string, coluna: string, valor: number | null, instituicao = PREF) => ({ cod_conta, coluna, valor, conta: cod_conta, instituicao });
const RGF_A1_E = [
  linha("DespesaComPessoalBruta", "TOTAL (ÚLTIMOS 12 MESES) (a)", 19967676.51),
  linha("ReceitaCorrenteLiquidaLimiteLegal", "Valor", 48679920.24),
  linha("ReceitaCorrenteLiquidaAjustada", "Valor", 48161200.24),
  linha("DespesaComPessoalTotal", "Valor", 18232463.81),
  linha("DespesaComPessoalTotal", "% sobre a RCL Ajustada", 37.86),
  linha("LimiteMaximoDespesaComPessoalTotal", "% sobre a RCL Ajustada", 54),
];
const RGF_A2 = [
  linha("DividaConsolidada", "SALDO DO EXERCÍCIO ANTERIOR", 25794852.76),
  linha("DividaConsolidada", "Até o 1º Quadrimestre", 25445399.05),
  linha("DividaConsolidada", "Até o 2º Quadrimestre", 25229649.41),
  linha("DividaConsolidadaLiquida", "Até o 1º Quadrimestre", 21679754.68),
  linha("DividaConsolidadaLiquida", "Até o 2º Quadrimestre", 18746988.78),
  linha("PercentualDaDCLSobreARCL", "Até o 1º Quadrimestre", 49.95),
  linha("PercentualDaDCLSobreARCL", "Até o 2º Quadrimestre", 38.51),
];
const RREO_A6 = [
  linha("ResultadoPrimarioComRPPSAcimaDaLinha", "VALOR", 3217020.39),
  linha("ResultadoPrimarioSemRPPSAcimaDaLinha", "VALOR", 3217020.39),
  linha("RREO6MetaDeResultadoPrimarioFixadaNoAnexoDeMetasFiscaisDaLDOParaOExercicioDeReferencia", "VALOR CORRENTE", 559548),
];

async function simulados() {
  console.log("── Respostas simuladas ──");

  await caso("IBGE: população mais recente ignora valores ausentes", () => {
    const r = interpretarAgregado([{ resultados: [{ series: [{ serie: { "2024": "7300", "2025": "-", "2026": "7366" } }] }] }]);
    assert.deepEqual(r, { ano: "2026", valor: 7366 });
    assert.deepEqual(interpretarAgregado([{ resultados: [{ series: [{ serie: { "2026": "..." } }] }] }]), null);
  });

  await caso("IBGE: sem estimativa, usa o Censo 2022", async () => {
    const { buscador } = simulado([
      ["/localidades/municipios/2900108", () => json({ "municipio-id": 2900108, "municipio-nome": "Abaíra", "UF-sigla": "BA", "microrregiao-nome": "Seabra" })],
      ["/agregados/6579/", () => json([{ resultados: [{ series: [{ serie: { "2026": "-" } }] }] }])],
      ["/agregados/4709/", () => json([{ resultados: [{ series: [{ serie: { "2022": "7301" } }] }] }])],
    ]);
    const d = await coletarIbge("2900108", buscador);
    assert.equal(d?.municipio, "Abaíra");
    assert.equal(d?.populacao, 7301);
    assert.equal(d?.tipoPopulacao, "CENSO");
  });

  await caso("IBGE: código inexistente devolve null", async () => {
    const { buscador } = simulado([["/localidades/municipios/", () => json([])]]);
    assert.equal(await coletarIbge("2999999", buscador), null);
  });

  await caso("LRF: faixas do Executivo (48,6 / 51,3 / 54)", () => {
    assert.equal(faixaPessoal(48.59, "E"), "REGULAR");
    assert.equal(faixaPessoal(48.6, "E"), "ALERTA");
    assert.equal(faixaPessoal(51.3, "E"), "ALERTA");
    assert.equal(faixaPessoal(51.31, "E"), "PRUDENCIAL");
    assert.equal(faixaPessoal(54, "E"), "PRUDENCIAL");
    assert.equal(faixaPessoal(54.01, "E"), "EXCEDIDO");
  });

  await caso("LRF: faixas do Legislativo municipal (5,4 / 5,7 / 6)", () => {
    assert.equal(faixaPessoal(2.34, "L"), "REGULAR");
    assert.equal(faixaPessoal(5.4, "L"), "ALERTA");
    assert.equal(faixaPessoal(5.71, "L"), "PRUDENCIAL");
    assert.equal(faixaPessoal(6.01, "L"), "EXCEDIDO");
    assert.equal(poderDaEntidade("CAMARA"), "L");
    assert.equal(poderDaEntidade("AUTARQUIA"), "E");
  });

  await caso("LRF: dívida consolidada líquida (alerta 108%, máximo 120%)", () => {
    assert.equal(faixaDcl(38.51), "REGULAR");
    assert.equal(faixaDcl(110), "ALERTA");
    assert.equal(faixaDcl(121), "EXCEDIDO");
  });

  await caso("SICONFI: RGF Anexo 01 (RCL e pessoal)", () => {
    const r = interpretarRgfAnexo01(RGF_A1_E);
    assert.equal(r.rcl, 48679920.24);
    assert.equal(r.rclAjustada, 48161200.24);
    assert.equal(r.dtp, 18232463.81);
    assert.equal(r.percentual, 37.86);
    const semPercentual = interpretarRgfAnexo01(RGF_A1_E.filter((l) => !l.coluna.startsWith("%")));
    assert.equal(semPercentual.percentual, 37.86, "calcula o % quando a linha não vem");
  });

  await caso("SICONFI: RGF Anexo 02 usa a última coluna 'Até o …'", () => {
    assert.deepEqual(interpretarRgfAnexo02(RGF_A2), { consolidada: 25229649.41, consolidadaLiquida: 18746988.78, percentualDcl: 38.51 });
    assert.equal(interpretarRgfAnexo02([]), null);
  });

  await caso("SICONFI: RREO Anexo 06 (resultado primário e meta)", () => {
    assert.deepEqual(interpretarRreoAnexo06(RREO_A6), { valor: 3217020.39, meta: 559548, criterio: "SEM_RPPS" });
    assert.equal(interpretarRreoAnexo06([]), null);
  });

  await caso("SICONFI: entregas do Executivo em 05/10/2026 (RGF do 2º quadrimestre pendente)", () => {
    const e = calcularEntregas(ENTREGUES, "E", "2026-10-05", [2025, 2026]);
    const pend = e.filter((x) => x.situacao === "PENDENTE").map((x) => `${x.sigla} ${x.rotuloPeriodo} ${x.prazo}`);
    assert.deepEqual(pend, ["RGF 2º quadrimestre/2026 2026-09-30"]);
    const aVencer = e.filter((x) => x.situacao === "A_VENCER").map((x) => `${x.sigla} ${x.rotuloPeriodo} ${x.prazo}`);
    assert.deepEqual(aVencer, ["MSC 09/2026 2026-10-31", "RREO 5º bimestre/2026 2026-11-30", "RGF 3º quadrimestre/2026 2027-01-30", "DCA exercício 2026 2027-04-30"]);
    assert.ok(e.some((x) => x.sigla === "DCA" && x.exercicio === 2025 && x.situacao === "ENTREGUE"));
  });

  await caso("SICONFI: entregas da Câmara (sem RREO/DCA; nada pendente)", () => {
    const e = calcularEntregas(ENTREGUES, "L", "2026-10-05", [2025, 2026]);
    assert.ok(!e.some((x) => x.sigla === "RREO" || x.sigla === "DCA"));
    assert.equal(e.filter((x) => x.situacao === "PENDENTE").length, 0);
  });

  await caso("SICONFI: RGF semestral (município pequeno que optou pelo art. 63)", () => {
    const semestral = [entrega(PREF, RGF, "S", 1, 2025), entrega(PREF, RGF, "S", 2, 2025), entrega(PREF, RGF, "S", 1)];
    const e = calcularEntregas(semestral, "E", "2026-10-05", [2026]).filter((x) => x.sigla === "RGF");
    assert.deepEqual(
      e.map((x) => `${x.rotuloPeriodo} ${x.situacao}`),
      ["1º semestre/2026 ENTREGUE", "2º semestre/2026 A_VENCER"],
    );
  });

  await caso("SICONFI: paginação por offset até hasMore=false", async () => {
    const { buscador, pedidas } = simulado([
      ["offset=2", () => json({ items: [{ n: 3 }], hasMore: false, limit: 2 })],
      ["extrato_entregas", () => json({ items: [{ n: 1 }, { n: 2 }], hasMore: true, limit: 2 })],
    ]);
    const itens = await consultarSiconfi("extrato_entregas", { id_ente: "2900108" }, { buscador, pausaMs: 0 });
    assert.equal(itens.length, 3);
    assert.equal(pedidas.length, 2);
  });

  await caso("SICONFI: coleta completa do Executivo com respostas simuladas", async () => {
    const { buscador, pedidas } = simulado([
      ["extrato_entregas", (u) => json({ items: ENTREGUES.filter((e) => String(e.exercicio) === u.searchParams.get("an_referencia")), hasMore: false })],
      ["RGF-Anexo+01", () => json({ items: RGF_A1_E, hasMore: false })],
      ["RGF-Anexo+02", () => json({ items: RGF_A2, hasMore: false })],
      ["RREO-Anexo+06", () => json({ items: RREO_A6, hasMore: false })],
    ]);
    const d = await coletarSiconfi("2900108", "E", { buscador, hoje: "2026-10-05", pausaMs: 0 });
    assert.ok(d);
    assert.equal(d.instituicao, PREF);
    assert.equal(d.pessoal?.percentual, 37.86);
    assert.equal(d.pessoal?.faixa, "REGULAR");
    assert.equal(d.pessoal?.referencia, "RGF 1º quadrimestre/2026");
    assert.equal(d.rcl?.valor, 48679920.24);
    assert.equal(d.divida?.percentualDcl, 38.51);
    assert.equal(d.resultadoPrimario?.valor, 3217020.39);
    assert.ok(pedidas.some((p) => p.includes("nr_periodo=1") && p.includes("in_periodicidade=Q") && p.includes("co_poder=E")));
  });

  await caso("SICONFI: ente sem nenhuma entrega devolve null", async () => {
    const { buscador } = simulado([]);
    assert.equal(await coletarSiconfi("2900108", "E", { buscador, hoje: "2026-10-05", pausaMs: 0 }), null);
  });

  await caso("SICONFI: Câmara também recebe dívida consolidada e resultado primário do Executivo", async () => {
    const { buscador, pedidas } = simulado([
      ["extrato_entregas", (u) => json({ items: ENTREGUES.filter((e) => String(e.exercicio) === u.searchParams.get("an_referencia")), hasMore: false })],
      ["RGF-Anexo+01", () => json({ items: [linha("DespesaComPessoalTotal", "Valor", 600000, CAM), linha("DespesaComPessoalTotal", "% sobre a RCL Ajustada", 2.5, CAM)], hasMore: false })],
      ["RGF-Anexo+02", () => json({ items: RGF_A2, hasMore: false })],
      ["RREO-Anexo+06", () => json({ items: RREO_A6, hasMore: false })],
    ]);
    const d = await coletarSiconfi("2900108", "L", { buscador, hoje: "2026-10-05", pausaMs: 0 });
    assert.equal(d?.pessoal?.faixa, "REGULAR");
    assert.equal(d?.divida?.percentualDcl, 38.51);
    assert.equal(d?.divida?.referencia, "RGF 1º quadrimestre/2026 — Executivo municipal");
    assert.equal(d?.resultadoPrimario?.valor, 3217020.39);
    assert.ok(pedidas.some((p) => p.includes("RGF-Anexo+02") && p.includes("co_poder=E")));
    assert.ok(pedidas.some((p) => p.includes("RGF-Anexo+01") && p.includes("co_poder=L")));
  });

  await caso("Alertas fiscais: folha acima do prudencial, DCL em alerta e entregas vencidas, do mais grave ao menos grave", () => {
    const base: DadosSiconfi = {
      exercicio: 2026,
      poder: "E",
      instituicao: PREF,
      rcl: null,
      pessoal: { valor: 1, percentual: 52, faixa: "PRUDENCIAL", referencia: "RGF 1º quadrimestre/2026" },
      divida: { consolidada: 1, consolidadaLiquida: 1, percentualDcl: 110, referencia: "RGF 1º quadrimestre/2026" },
      resultadoPrimario: null,
      entregas: calcularEntregas(ENTREGUES, "E", "2026-10-05", [2025, 2026]),
      avisos: [],
    };
    const agora = new Date("2026-10-05T12:00:00Z");
    const coleta = { dados: base, erro: null, travada: false, coletadoEm: agora };
    const a = calcularAlertasFiscais({ entidade: "Prefeitura", codigoIbge: "2900108", siconfi: coleta, agora });
    assert.deepEqual(
      a.map((x) => `${x.id}:${x.nivel}`),
      ["pessoal:PRUDENCIAL", "divida:ALERTA", ...(base.entregas.some((e) => e.situacao === "PENDENTE") ? ["entregas:" + a.find((x) => x.id === "entregas")!.nivel] : [])].sort(
        (x, y) => ["EXCEDIDO", "PRUDENCIAL", "ALERTA", "INFO"].indexOf(x.split(":")[1]) - ["EXCEDIDO", "PRUDENCIAL", "ALERTA", "INFO"].indexOf(y.split(":")[1]),
      ),
    );
    assert.ok(a.find((x) => x.id === "pessoal")!.registrar!.startsWith("/alertas/nova?origem=ALERTA"));
    const regular = { ...base, pessoal: { ...base.pessoal!, percentual: 40, faixa: "REGULAR" as const }, divida: { ...base.divida!, percentualDcl: 30 }, entregas: [] };
    assert.deepEqual(calcularAlertasFiscais({ entidade: "P", codigoIbge: "1", siconfi: { ...coleta, dados: regular }, agora }), []);
    const antiga = new Date("2026-08-01T00:00:00Z");
    assert.equal(calcularAlertasFiscais({ entidade: "P", codigoIbge: "1", siconfi: { ...coleta, dados: regular, coletadoEm: antiga }, agora })[0]?.id, "coleta");
    assert.equal(calcularAlertasFiscais({ entidade: "P", codigoIbge: null, siconfi: null, agora })[0]?.titulo, "Código IBGE não cadastrado");
  });

  await caso("SICONFI: tenta o RGF Simplificado quando o completo vem vazio", async () => {
    const { buscador } = simulado([
      ["extrato_entregas", () => json({ items: [entrega(CAM, RGF, "S", 1)], hasMore: false })],
      ["co_tipo_demonstrativo=RGF+Simplificado", () => json({ items: [linha("DespesaComPessoalTotal", "Valor", 600000, CAM), linha("DespesaComPessoalTotal", "% sobre a RCL Ajustada", 5.5, CAM)], hasMore: false })],
    ]);
    const d = await coletarSiconfi("2900108", "L", { buscador, hoje: "2026-10-05", pausaMs: 0 });
    assert.equal(d?.pessoal?.faixa, "ALERTA");
  });

  await caso("HTTP: repete em 503 e aceita a segunda resposta", async () => {
    let n = 0;
    const buscador = (async () => (++n === 1 ? new Response("fora", { status: 503 }) : json({ ok: true }))) as Buscador;
    assert.deepEqual(await buscarJson("https://exemplo/x", { fonte: "Teste", buscador }), { ok: true });
    assert.equal(n, 2);
  });

  await caso("HTTP: 401 vira mensagem de chave inválida, sem repetir", async () => {
    let n = 0;
    const buscador = (async () => (n++, new Response('{"Erro na API":"Chave de API não informada!"}', { status: 401 }))) as Buscador;
    await assert.rejects(buscarJson("https://exemplo/x", { fonte: "Portal", buscador }), (e: unknown) => e instanceof ErroIntegracao && /chave/.test(e.message));
    assert.equal(n, 1);
  });

  await caso("HTTP: timeout vira ErroIntegracao", async () => {
    // O timer do AbortSignal.timeout não mantém o processo vivo; o intervalo faz o papel do socket aberto.
    const buscador = ((_: unknown, init?: RequestInit) =>
      new Promise((_r, rej) => {
        const vivo = setInterval(() => {}, 1000);
        init?.signal?.addEventListener("abort", () => {
          clearInterval(vivo);
          rej(init.signal!.reason);
        });
      })) as Buscador;
    await assert.rejects(
      buscarJson("https://exemplo/x", { fonte: "Lenta", buscador, timeoutMs: 50, tentativas: 1 }),
      (e: unknown) => e instanceof ErroIntegracao && /a tempo/.test(e.message),
    );
  });

  await caso("Portal: soma recursos por órgão e por mês", () => {
    const r = resumirRecursos([
      { anoMes: 202601, nomeOrgaoSuperior: "Ministério da Saúde", valor: 1000.5 },
      { anoMes: 202601, nomeOrgaoSuperior: "Ministério da Educação", valor: 300 },
      { anoMes: 202602, nomeOrgaoSuperior: "Ministério da Saúde", valor: 200 },
      { lixo: true },
    ]);
    assert.equal(r.total, 1500.5);
    assert.equal(r.registros, 3);
    assert.deepEqual(r.porOrgao[0], { orgao: "Ministério da Saúde", valor: 1200.5 });
    assert.deepEqual(r.porMes, [{ anoMes: 202601, valor: 1300.5 }, { anoMes: 202602, valor: 200 }]);
  });

  await caso("Portal: convênios vigentes e do próprio CNPJ primeiro", () => {
    const c = resumirConvenios(
      [
        { dimConvenio: { numero: "1", objeto: "Pavimentação" }, convenente: { nome: "Município", cnpjFormatado: "13.670.021/0001-66" }, orgao: { sigla: "MCID" }, dataFinalVigencia: "2027-12-31", valor: 500000, valorLiberado: 100000 },
        { dimConvenio: { numero: "2", objeto: "Antigo" }, convenente: { nome: "Município" }, dataFinalVigencia: "2020-01-01", valor: 10, valorLiberado: 10 },
        { dimConvenio: { numero: "3", objeto: "Cultura" }, convenente: { nome: "Associação", cnpjFormatado: "11.111.111/0001-11" }, dataFinalVigencia: "2026-12-31", valor: 900000, valorLiberado: 0 },
      ],
      "13670021000166",
      "2026-10-05",
    );
    assert.equal(c.encontrados, 3);
    assert.equal(c.vigentes, 2);
    assert.equal(c.valorVigentes, 1400000);
    assert.equal(c.lista[0].numero, "1");
    assert.equal(c.lista[0].doCliente, true);
  });

  await caso("Portal: CEIS/CNEP interpretados e paginação para em < 15 registros", async () => {
    const amostra = {
      dataInicioSancao: "2025-01-10",
      dataFimSancao: "2027-01-10",
      tipoSancao: { descricaoResumida: "Impedimento/proibição de contratar" },
      orgaoSancionador: { nome: "Prefeitura de X", siglaUf: "BA" },
      sancionado: { nome: "EMPRESA LTDA" },
      numeroProcesso: "123/2024",
      valorMulta: "10.000,00",
    };
    assert.equal(interpretarSancoes([amostra], "CNEP")[0].orgao, "Prefeitura de X (BA)");
    const { buscador, pedidas } = simulado([
      ["/ceis", () => json([amostra])],
      ["/cnep", () => json([])],
    ]);
    const s = await consultarSancoes("11222333000181", { chave: "teste", buscador, pausaMs: 0 });
    assert.equal(s.length, 1);
    assert.equal(s[0].cadastro, "CEIS");
    assert.equal(pedidas.length, 2);
  });

  await caso("Portal: coleta com respostas simuladas envia a chave no header", async () => {
    let header: string | null = null;
    const buscador = (async (entrada: string | URL | Request, init?: RequestInit) => {
      header = new Headers(init?.headers).get("chave-api-dados");
      const url = String(entrada);
      if (url.includes("recursos-recebidos")) return json([{ anoMes: 202601, nomeOrgaoSuperior: "Ministério da Saúde", valor: 10 }]);
      return json([]);
    }) as Buscador;
    const d = await coletarPortalTransparencia({ cnpj: "13670021000166", codigoIbge: "2900108" }, { chave: "abc", buscador, hoje: "2026-10-05", pausaMs: 0 });
    assert.equal(header, "abc");
    assert.equal(d.recursos.total, 10);
    assert.equal(d.mesFim, 10);
  });

  await caso("TCM-BA: links oficiais com o município e o código IBGE", () => {
    const l = linksTcmBa({ municipio: "Abaíra", codigoIbge: "2900108", tipo: "CAMARA" });
    assert.ok(l.length >= 5);
    assert.ok(l.every((x) => x.url.startsWith("https://")));
    assert.ok(l[0].descricao.includes("2900108") && l[0].descricao.includes("Câmara"));
  });
}

async function reais(codigo: string) {
  console.log(`\n── APIs reais (código IBGE ${codigo}) ──`);
  await caso("IBGE real: município e população", async () => {
    const d = await coletarIbge(codigo);
    assert.ok(d?.municipio, "sem município");
    assert.ok((d?.populacao ?? 0) > 0, "sem população");
    console.log(`      ${d!.municipio}/${d!.uf}: ${d!.populacao?.toLocaleString("pt-BR")} hab. (${d!.tipoPopulacao} ${d!.anoPopulacao})`);
  });
  for (const poder of ["E", "L"] as const) {
    await caso(`SICONFI real: ${poder === "E" ? "Executivo" : "Legislativo"}`, async () => {
      const d = await coletarSiconfi(codigo, poder);
      assert.ok(d, "sem entregas");
      const pend = d.entregas.filter((e) => e.situacao === "PENDENTE").length;
      console.log(
        `      ${d.instituicao}: RCL ${d.rcl?.valor.toLocaleString("pt-BR") ?? "—"} · pessoal ${d.pessoal?.percentual ?? "—"}% (${d.pessoal?.faixa ?? "—"}, ${d.pessoal?.referencia ?? "—"})` +
          ` · DCL ${d.divida?.percentualDcl ?? "—"}% · primário ${d.resultadoPrimario?.valor.toLocaleString("pt-BR") ?? "—"} · pendentes ${pend}`,
      );
      for (const a of d.avisos) console.log(`      aviso: ${a}`);
      assert.ok(d.pessoal, "sem despesa com pessoal");
    });
  }
  const chave = chavePortal();
  if (!chave) {
    console.log("      Portal da Transparência: PORTAL_TRANSPARENCIA_CHAVE não definida — consulta real pulada.");
    return;
  }
  await caso("Portal da Transparência real: recursos e convênios", async () => {
    const d = await coletarPortalTransparencia({ cnpj: "13670021000166", codigoIbge: codigo }, { chave, hoje: new Date().toISOString().slice(0, 10) });
    console.log(`      recebido ${d.recursos.total.toLocaleString("pt-BR")} (${d.recursos.registros} registros) · convênios vigentes ${d.convenios.vigentes}`);
  });
}

async function main() {
  await simulados();
  if (values.real) await reais(values.ibge ?? "2900108");
  console.log(falhas ? `\n${falhas} de ${total} verificação(ões) falharam.` : `\nTodas as ${total} verificações passaram.`);
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
