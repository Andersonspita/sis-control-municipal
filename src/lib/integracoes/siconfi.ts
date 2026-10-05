import { z } from "zod";
import { buscarJson, esperar, type Buscador } from "./http";
import { faixaPessoal } from "./lrf";
import type { DadosSiconfi, EntregaSiconfi, Poder } from "./tipos";

// API de dados abertos do SICONFI (Tesouro Nacional, pública, sem chave):
// https://apidatalake.tesouro.gov.br/docs/siconfi/ — Oracle ORDS, paginada por offset (items, hasMore, limit).
const BASE = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt";
const FONTE = "SICONFI";
const MAX_PAGINAS = 10;
/** Pausa entre chamadas, para não sobrecarregar a API pública (o cron percorre vários clientes). */
const PAUSA_MS = 400;

const esquemaPagina = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  hasMore: z.boolean().optional(),
  limit: z.number().optional(),
});

const esquemaEntrega = z.object({
  exercicio: z.coerce.number(),
  instituicao: z.string().nullish(),
  entregavel: z.string(),
  periodo: z.coerce.number(),
  periodicidade: z.string(),
  data_status: z.string().nullish(),
});
export type EntregaBruta = z.infer<typeof esquemaEntrega>;

const esquemaLinha = z.object({
  instituicao: z.string().nullish(),
  coluna: z.string(),
  cod_conta: z.string(),
  conta: z.string().nullish(),
  valor: z.number().nullable(),
});
export type LinhaDemonstrativo = z.infer<typeof esquemaLinha>;

type Opcoes = { buscador?: Buscador; pausaMs?: number };

/** Consulta um endpoint percorrendo as páginas (offset) até `hasMore` ser falso. */
export async function consultarSiconfi(endpoint: string, params: Record<string, string | number>, opcoes: Opcoes = {}) {
  const itens: Record<string, unknown>[] = [];
  let offset = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
    if (offset) qs.set("offset", String(offset));
    const json = esquemaPagina.parse(await buscarJson(`${BASE}/${endpoint}?${qs}`, { fonte: FONTE, buscador: opcoes.buscador }));
    itens.push(...json.items);
    if (!json.hasMore || !json.items.length) break;
    offset += json.items.length;
    await esperar(opcoes.pausaMs ?? PAUSA_MS);
  }
  return itens;
}

// ───────────── Entregas (extrato_entregas) ─────────────

type Sigla = EntregaSiconfi["sigla"];

export function siglaEntregavel(nome: string): Sigla | null {
  if (/execu[cç][aã]o or[cç]ament/i.test(nome)) return "RREO";
  if (/gest[aã]o fiscal/i.test(nome)) return "RGF";
  if (/\bDCA\b|balan[cç]o anual/i.test(nome)) return "DCA";
  if (/^MSC Agregada/i.test(nome)) return "MSC";
  return null;
}

/** Linhas da instituição que responde pelo poder (o extrato traz Prefeitura e Câmara juntas). */
export function daInstituicao<T extends { instituicao?: string | null }>(linhas: T[], poder: Poder): T[] {
  const camara = (l: T) => /c[aâ]mara|legislativ/i.test(l.instituicao ?? "");
  if (poder === "L") return linhas.filter(camara);
  const prefeitura = linhas.filter((l) => /prefeitura|executiv/i.test(l.instituicao ?? ""));
  return prefeitura.length ? prefeitura : linhas.filter((l) => !camara(l));
}

const NOME: Record<Sigla, string> = {
  RREO: "Relatório Resumido de Execução Orçamentária",
  RGF: "Relatório de Gestão Fiscal",
  DCA: "Declaração de Contas Anuais (DCA)",
  MSC: "Matriz de Saldos Contábeis (MSC Agregada)",
};

function iso(ano: number, mes: number, dia: number) {
  return new Date(Date.UTC(ano, mes - 1, dia)).toISOString().slice(0, 10);
}
function fimDoMes(ano: number, mes: number) {
  return iso(ano, mes + 1, 0);
}
function somarDiasIso(data: string, dias: number) {
  const d = new Date(`${data}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function rotuloPeriodo(periodicidade: string, periodo: number, exercicio: number) {
  const nomes: Record<string, string> = { B: "bimestre", Q: "quadrimestre", S: "semestre" };
  if (periodicidade === "M") return `${String(periodo).padStart(2, "0")}/${exercicio}`;
  if (periodicidade === "A") return `exercício ${exercicio}`;
  return `${periodo}º ${nomes[periodicidade] ?? "período"}/${exercicio}`;
}

type Esperada = Omit<EntregaSiconfi, "entregueEm" | "situacao">;

/** Obrigações do exercício e prazos (LRF, arts. 51, 52, 54 e 55; MSC: até o fim do mês seguinte). */
function obrigacoes(exercicio: number, poder: Poder, periodicidadeRgf: "Q" | "S"): Esperada[] {
  const lista: Esperada[] = [];
  const add = (sigla: Sigla, periodicidade: string, periodo: number, prazo: string) =>
    lista.push({ entregavel: NOME[sigla], sigla, exercicio, periodo, periodicidade, rotuloPeriodo: rotuloPeriodo(periodicidade, periodo, exercicio), prazo });

  if (poder === "E") {
    for (let b = 1; b <= 6; b++) add("RREO", "B", b, somarDiasIso(fimDoMes(exercicio, b * 2), 30));
    add("DCA", "A", 1, iso(exercicio + 1, 4, 30));
  }
  const meses = periodicidadeRgf === "Q" ? [4, 8, 12] : [6, 12];
  meses.forEach((mes, i) => add("RGF", periodicidadeRgf, i + 1, somarDiasIso(fimDoMes(exercicio, mes), 30)));
  for (let m = 1; m <= 12; m++) add("MSC", "M", m, fimDoMes(exercicio, m + 1));
  return lista;
}

/**
 * Cruza as obrigações dos exercícios com o que consta no extrato de entregas.
 * Mantém o que já venceu (entregue ou pendente), o que foi entregue antes do prazo e,
 * de cada demonstrativo, a próxima obrigação a vencer.
 */
export function calcularEntregas(entregues: EntregaBruta[], poder: Poder, hoje: string, exercicios: number[]): EntregaSiconfi[] {
  const proprias = daInstituicao(entregues, poder);
  const chave = (sigla: Sigla, exercicio: number, periodicidade: string, periodo: number) => `${sigla}|${exercicio}|${periodicidade}|${periodo}`;
  const datas = new Map<string, string | null>();
  for (const e of proprias) {
    const sigla = siglaEntregavel(e.entregavel);
    if (!sigla) continue;
    const k = chave(sigla, e.exercicio, e.periodicidade, e.periodo);
    const data = e.data_status?.slice(0, 10) ?? null;
    const atual = datas.get(k);
    datas.set(k, atual && data ? (atual < data ? atual : data) : (atual ?? data));
  }

  const saida: EntregaSiconfi[] = [];
  for (const exercicio of [...exercicios].sort()) {
    // Municípios com menos de 50 mil habitantes podem optar pelo RGF semestral (LRF, art. 63).
    const semestral = proprias.some((e) => siglaEntregavel(e.entregavel) === "RGF" && e.periodicidade === "S" && e.exercicio >= exercicio - 1);
    for (const o of obrigacoes(exercicio, poder, semestral ? "S" : "Q")) {
      const k = chave(o.sigla, o.exercicio, o.periodicidade, o.periodo);
      if (datas.has(k)) saida.push({ ...o, entregueEm: datas.get(k) ?? null, situacao: "ENTREGUE" });
      else if (o.prazo < hoje) saida.push({ ...o, entregueEm: null, situacao: "PENDENTE" });
      else saida.push({ ...o, entregueEm: null, situacao: "A_VENCER" });
    }
  }
  // Das futuras, só a primeira de cada demonstrativo.
  const vistas = new Set<Sigla>();
  return saida
    .sort((a, b) => a.prazo.localeCompare(b.prazo))
    .filter((e) => {
      if (e.situacao !== "A_VENCER") return true;
      if (vistas.has(e.sigla)) return false;
      vistas.add(e.sigla);
      return true;
    });
}

// ───────────── Demonstrativos (rgf, rreo) ─────────────

const valorDe = (linhas: LinhaDemonstrativo[], conta: RegExp, coluna: RegExp) =>
  linhas.find((l) => conta.test(l.cod_conta) && coluna.test(l.coluna) && l.valor !== null)?.valor ?? null;

/** RGF Anexo 01: RCL, RCL ajustada e despesa total com pessoal (valor e % sobre a RCL ajustada). */
export function interpretarRgfAnexo01(linhas: LinhaDemonstrativo[]) {
  const rcl = valorDe(linhas, /^ReceitaCorrenteLiquidaLimiteLegal$/, /^Valor$/i);
  const rclAjustada = valorDe(linhas, /^ReceitaCorrenteLiquidaAjustada$/, /^Valor$/i);
  const dtp =
    valorDe(linhas, /^DespesaComPessoalTotal$/, /^Valor$/i) ??
    linhas.find((l) => /DESPESA TOTAL COM PESSOAL/i.test(l.conta ?? "") && /^Valor$/i.test(l.coluna))?.valor ??
    null;
  let percentual = valorDe(linhas, /^DespesaComPessoalTotal$/, /%/);
  if (percentual === null && dtp !== null && (rclAjustada ?? rcl)) percentual = Math.round((dtp / (rclAjustada ?? rcl)!) * 10_000) / 100;
  return { rcl, rclAjustada, dtp, percentual };
}

/** RGF Anexo 02: saldos da última coluna "Até o Nº quadrimestre/semestre". */
export function interpretarRgfAnexo02(linhas: LinhaDemonstrativo[]) {
  const colunas = [...new Set(linhas.map((l) => l.coluna).filter((c) => /^At[eé] o/i.test(c)))];
  const ultima = colunas.sort().at(-1);
  if (!ultima) return null;
  const col = new RegExp(`^${ultima.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
  return {
    consolidada: valorDe(linhas, /^DividaConsolidada$/, col),
    consolidadaLiquida: valorDe(linhas, /^DividaConsolidadaLiquida$/, col),
    percentualDcl: valorDe(linhas, /^PercentualDaDCLSobreARCL$/, col),
  };
}

/** RREO Anexo 06: resultado primário acima da linha (sem RPPS, ou com RPPS) e a meta da LDO. */
export function interpretarRreoAnexo06(linhas: LinhaDemonstrativo[]) {
  const sem = valorDe(linhas, /^ResultadoPrimarioSemRPPSAcimaDaLinha$/, /^VALOR$/i);
  const com = valorDe(linhas, /^ResultadoPrimarioComRPPSAcimaDaLinha$/, /^VALOR$/i);
  const meta = valorDe(linhas, /MetaDeResultadoPrimario/, /VALOR CORRENTE/i);
  if (sem === null && com === null) return null;
  return sem !== null ? { valor: sem, meta, criterio: "SEM_RPPS" as const } : { valor: com!, meta, criterio: "COM_RPPS" as const };
}

/** RREO Anexo 03: RCL dos últimos 12 meses (usada quando o RGF não traz a RCL). */
export function interpretarRreoAnexo03(linhas: LinhaDemonstrativo[]) {
  return {
    rcl: valorDe(linhas, /^RREO3ReceitaCorrenteLiquida$/, /TOTAL \(ÚLTIMOS 12 MESES\)/i),
    rclAjustadaPessoal: valorDe(linhas, /DaDespesaComPessoal$/, /TOTAL \(ÚLTIMOS 12 MESES\)/i),
  };
}

async function demonstrativo(
  endpoint: "rgf" | "rreo",
  params: Record<string, string | number>,
  tipos: string[],
  opcoes: Opcoes,
): Promise<LinhaDemonstrativo[]> {
  // Entes pequenos podem publicar a versão simplificada do demonstrativo.
  for (const tipo of tipos) {
    await esperar(opcoes.pausaMs ?? PAUSA_MS);
    const itens = await consultarSiconfi(endpoint, { ...params, co_tipo_demonstrativo: tipo }, opcoes);
    const linhas = itens.flatMap((i) => {
      const r = esquemaLinha.safeParse(i);
      return r.success ? [r.data] : [];
    });
    if (linhas.length) return linhas;
  }
  return [];
}

/** Períodos entregues de um demonstrativo, do mais recente ao mais antigo. */
function entreguesDe(entregues: EntregaBruta[], sigla: Sigla) {
  const vistos = new Set<string>();
  return entregues
    .filter((e) => siglaEntregavel(e.entregavel) === sigla)
    .sort((a, b) => b.exercicio - a.exercicio || b.periodo - a.periodo)
    .filter((e) => {
      const k = `${e.exercicio}|${e.periodicidade}|${e.periodo}`;
      if (vistos.has(k)) return false;
      vistos.add(k);
      return true;
    });
}

/** Hoje no fuso da Bahia (AAAA-MM-DD). */
export function hojeNaBahia(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(agora);
}

export async function coletarSiconfi(
  codigoIbge: string,
  poder: Poder,
  opcoes: Opcoes & { hoje?: string } = {},
): Promise<DadosSiconfi | null> {
  const hoje = opcoes.hoje ?? hojeNaBahia();
  const exercicio = Number(hoje.slice(0, 4));
  const exercicios = [exercicio - 1, exercicio];

  const entregues: EntregaBruta[] = [];
  for (const ano of exercicios) {
    const itens = await consultarSiconfi("extrato_entregas", { id_ente: codigoIbge, an_referencia: ano }, opcoes);
    for (const i of itens) {
      const r = esquemaEntrega.safeParse(i);
      if (r.success) entregues.push(r.data);
    }
    await esperar(opcoes.pausaMs ?? PAUSA_MS);
  }
  const proprias = daInstituicao(entregues, poder);
  if (!entregues.length) return null;

  const avisos: string[] = [];
  const dados: DadosSiconfi = {
    exercicio,
    poder,
    instituicao: proprias[0]?.instituicao ?? null,
    rcl: null,
    pessoal: null,
    divida: null,
    resultadoPrimario: null,
    entregas: calcularEntregas(entregues, poder, hoje, exercicios),
    avisos,
  };
  if (!proprias.length) avisos.push(`Nenhuma entrega do ${poder === "L" ? "Legislativo" : "Executivo"} no extrato do SICONFI para ${exercicios.join(" e ")}.`);

  const rgf = entreguesDe(proprias, "RGF")[0];
  if (rgf) {
    const base = {
      an_exercicio: rgf.exercicio,
      in_periodicidade: rgf.periodicidade,
      nr_periodo: rgf.periodo,
      co_esfera: "M",
      co_poder: poder,
      id_ente: codigoIbge,
    };
    const referencia = `RGF ${rotuloPeriodo(rgf.periodicidade, rgf.periodo, rgf.exercicio)}`;
    const a1 = interpretarRgfAnexo01(await demonstrativo("rgf", { ...base, no_anexo: "RGF-Anexo 01" }, ["RGF", "RGF Simplificado"], opcoes));
    if (a1.rcl !== null) dados.rcl = { valor: a1.rcl, ajustadaPessoal: a1.rclAjustada, referencia };
    if (a1.dtp !== null && a1.percentual !== null) {
      dados.pessoal = { valor: a1.dtp, percentual: a1.percentual, faixa: faixaPessoal(a1.percentual, poder), referencia };
    } else avisos.push(`O ${referencia} não trouxe a despesa total com pessoal.`);

    if (poder === "E") {
      const a2 = interpretarRgfAnexo02(await demonstrativo("rgf", { ...base, no_anexo: "RGF-Anexo 02" }, ["RGF", "RGF Simplificado"], opcoes));
      if (a2 && (a2.consolidada !== null || a2.consolidadaLiquida !== null)) dados.divida = { ...a2, referencia };
    }
  } else avisos.push("Nenhum RGF entregue no exercício atual nem no anterior.");

  if (poder === "E") {
    const rreo = entreguesDe(proprias, "RREO")[0];
    if (rreo) {
      const base = { an_exercicio: rreo.exercicio, nr_periodo: rreo.periodo, co_esfera: "M", id_ente: codigoIbge };
      const referencia = `RREO ${rotuloPeriodo("B", rreo.periodo, rreo.exercicio)}`;
      const a6 = interpretarRreoAnexo06(await demonstrativo("rreo", { ...base, no_anexo: "RREO-Anexo 06" }, ["RREO", "RREO Simplificado"], opcoes));
      if (a6) dados.resultadoPrimario = { ...a6, referencia };
      if (!dados.rcl) {
        const a3 = interpretarRreoAnexo03(await demonstrativo("rreo", { ...base, no_anexo: "RREO-Anexo 03" }, ["RREO", "RREO Simplificado"], opcoes));
        if (a3.rcl !== null) dados.rcl = { valor: a3.rcl, ajustadaPessoal: a3.rclAjustadaPessoal, referencia };
      }
    } else avisos.push("Nenhum RREO entregue no exercício atual nem no anterior.");
  }
  return dados;
}
