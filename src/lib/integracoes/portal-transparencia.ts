import { z } from "zod";
import { buscarJson, ErroIntegracao, esperar, type Buscador } from "./http";
import type { ConvenioResumo, DadosPortalTransparencia, SancaoResumo } from "./tipos";

// API de dados do Portal da Transparência (CGU): https://api.portaldatransparencia.gov.br/swagger-ui/index.html
// Exige o header "chave-api-dados" (cadastro gratuito em https://portaldatransparencia.gov.br/api-de-dados/cadastrar-email).
// Limite de 90 requisições/minuto entre 6h e 24h (300/min na madrugada); as páginas têm 15 registros.
const BASE = "https://api.portaldatransparencia.gov.br/api-de-dados";
const FONTE = "Portal da Transparência";
const PAUSA_MS = 700;
const MAX_PAGINAS_RECURSOS = 20;
const MAX_PAGINAS_CONVENIOS = 10;

export const MENSAGEM_SEM_CHAVE =
  "Integração desabilitada: configure a variável PORTAL_TRANSPARENCIA_CHAVE com a chave da API de dados do Portal da Transparência.";

export function chavePortal() {
  return process.env.PORTAL_TRANSPARENCIA_CHAVE?.trim() || null;
}

type Opcoes = { chave: string; buscador?: Buscador; pausaMs?: number };

async function paginas(caminho: string, params: Record<string, string>, maxPaginas: number, opcoes: Opcoes) {
  const itens: unknown[] = [];
  let truncado = false;
  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    if (pagina > 1) await esperar(opcoes.pausaMs ?? PAUSA_MS);
    const qs = new URLSearchParams({ ...params, pagina: String(pagina) });
    const json = await buscarJson(`${BASE}/${caminho}?${qs}`, {
      fonte: FONTE,
      headers: { "chave-api-dados": opcoes.chave },
      buscador: opcoes.buscador,
    });
    const lista = z.array(z.unknown()).parse(json);
    itens.push(...lista);
    if (lista.length < 15) break;
    if (pagina === maxPaginas) truncado = true;
  }
  return { itens, truncado };
}

const numero = z.preprocess((v) => (v === null || v === undefined || v === "" ? 0 : Number(v)), z.number().catch(0));

const esquemaRecurso = z.object({
  anoMes: z.coerce.number(),
  nomeOrgaoSuperior: z.string().nullish(),
  nomeOrgao: z.string().nullish(),
  nomePessoa: z.string().nullish(),
  municipioPessoa: z.string().nullish(),
  siglaUFPessoa: z.string().nullish(),
  valor: numero,
});

/** Soma os recursos federais recebidos por órgão superior e por mês. */
export function resumirRecursos(itens: unknown[]) {
  const linhas = itens.flatMap((i) => {
    const r = esquemaRecurso.safeParse(i);
    return r.success ? [r.data] : [];
  });
  const porOrgao = new Map<string, number>();
  const porMes = new Map<number, number>();
  let total = 0;
  for (const l of linhas) {
    total += l.valor;
    const orgao = l.nomeOrgaoSuperior || l.nomeOrgao || "Não informado";
    porOrgao.set(orgao, (porOrgao.get(orgao) ?? 0) + l.valor);
    porMes.set(l.anoMes, (porMes.get(l.anoMes) ?? 0) + l.valor);
  }
  const primeiro = linhas.find((l) => l.nomePessoa);
  return {
    total: arredondar(total),
    registros: linhas.length,
    favorecido: primeiro
      ? {
          nome: primeiro.nomePessoa ?? "",
          municipio: [primeiro.municipioPessoa, primeiro.siglaUFPessoa].filter(Boolean).join("/") || null,
        }
      : null,
    porOrgao: [...porOrgao].map(([orgao, valor]) => ({ orgao, valor: arredondar(valor) })).sort((a, b) => b.valor - a.valor),
    porMes: [...porMes].map(([anoMes, valor]) => ({ anoMes, valor: arredondar(valor) })).sort((a, b) => a.anoMes - b.anoMes),
  };
}

const esquemaConvenio = z.object({
  dataInicioVigencia: z.string().nullish(),
  dataFinalVigencia: z.string().nullish(),
  situacao: z.string().nullish(),
  dimConvenio: z.object({ numero: z.string().nullish(), objeto: z.string().nullish() }).nullish(),
  convenente: z.object({ nome: z.string().nullish(), cnpjFormatado: z.string().nullish() }).nullish(),
  orgao: z.object({ nome: z.string().nullish(), sigla: z.string().nullish() }).nullish(),
  valor: numero,
  valorLiberado: numero,
});

const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
const arredondar = (v: number) => Math.round(v * 100) / 100;

/** Convênios do município: destaca os do próprio cliente (CNPJ) e os vigentes na data de referência. */
export function resumirConvenios(itens: unknown[], cnpj: string, hoje: string) {
  const lista: ConvenioResumo[] = itens.flatMap((i) => {
    const r = esquemaConvenio.safeParse(i);
    if (!r.success) return [];
    const c = r.data;
    return [
      {
        numero: c.dimConvenio?.numero ?? "—",
        objeto: (c.dimConvenio?.objeto ?? "").slice(0, 300),
        orgao: c.orgao?.sigla || c.orgao?.nome || "—",
        situacao: c.situacao ?? "—",
        convenente: c.convenente?.nome ?? "—",
        doCliente: soDigitos(c.convenente?.cnpjFormatado) === cnpj,
        inicioVigencia: c.dataInicioVigencia ?? null,
        fimVigencia: c.dataFinalVigencia ?? null,
        valor: c.valor,
        valorLiberado: c.valorLiberado,
      },
    ];
  });
  const vigentes = lista.filter((c) => !c.fimVigencia || c.fimVigencia.slice(0, 10) >= hoje);
  return {
    encontrados: lista.length,
    vigentes: vigentes.length,
    valorVigentes: arredondar(vigentes.reduce((s, c) => s + c.valor, 0)),
    liberadoVigentes: arredondar(vigentes.reduce((s, c) => s + c.valorLiberado, 0)),
    lista: vigentes.sort((a, b) => Number(b.doCliente) - Number(a.doCliente) || b.valor - a.valor).slice(0, 30),
  };
}

export async function coletarPortalTransparencia(
  cliente: { cnpj: string; codigoIbge: string },
  opcoes: Opcoes & { hoje: string },
): Promise<DadosPortalTransparencia> {
  const ano = Number(opcoes.hoje.slice(0, 4));
  const mesFim = Number(opcoes.hoje.slice(5, 7));
  const mm = (m: number) => `${String(m).padStart(2, "0")}/${ano}`;

  const recursos = await paginas(
    "despesas/recursos-recebidos",
    { mesAnoInicio: mm(1), mesAnoFim: mm(mesFim), codigoFavorecido: cliente.cnpj },
    MAX_PAGINAS_RECURSOS,
    opcoes,
  );
  await esperar(opcoes.pausaMs ?? PAUSA_MS);
  const convenios = await paginas("convenios", { codigoIBGE: cliente.codigoIbge }, MAX_PAGINAS_CONVENIOS, opcoes);

  return {
    ano,
    mesInicio: 1,
    mesFim,
    recursos: { ...resumirRecursos(recursos.itens), truncado: recursos.truncado },
    convenios: { ...resumirConvenios(convenios.itens, cliente.cnpj, opcoes.hoje), truncado: convenios.truncado },
  };
}

const esquemaSancao = z.object({
  dataInicioSancao: z.string().nullish(),
  dataFimSancao: z.string().nullish(),
  numeroProcesso: z.string().nullish(),
  valorMulta: z.union([z.string(), z.number()]).nullish(),
  tipoSancao: z.object({ descricaoResumida: z.string().nullish(), descricaoPortal: z.string().nullish() }).nullish(),
  orgaoSancionador: z.object({ nome: z.string().nullish(), siglaUf: z.string().nullish() }).nullish(),
  sancionado: z.object({ nome: z.string().nullish() }).nullish(),
});

export function interpretarSancoes(itens: unknown[], cadastro: SancaoResumo["cadastro"]): SancaoResumo[] {
  return itens.flatMap((i) => {
    const r = esquemaSancao.safeParse(i);
    if (!r.success) return [];
    const s = r.data;
    const orgao = s.orgaoSancionador?.nome ?? "—";
    return [
      {
        cadastro,
        sancionado: s.sancionado?.nome ?? "—",
        tipo: s.tipoSancao?.descricaoResumida || s.tipoSancao?.descricaoPortal || "—",
        orgao: s.orgaoSancionador?.siglaUf ? `${orgao} (${s.orgaoSancionador.siglaUf})` : orgao,
        inicio: s.dataInicioSancao ?? null,
        fim: s.dataFimSancao ?? null,
        processo: s.numeroProcesso ?? null,
        multa: s.valorMulta === null || s.valorMulta === undefined || s.valorMulta === "" ? null : String(s.valorMulta),
      },
    ];
  });
}

/** Consulta CEIS (inidôneas e suspensas) e CNEP (punidas pela Lei Anticorrupção) por CNPJ. */
export async function consultarSancoes(cnpj: string, opcoes: Opcoes): Promise<SancaoResumo[]> {
  if (!/^\d{14}$/.test(cnpj)) throw new ErroIntegracao("CNPJ inválido.");
  const ceis = await paginas("ceis", { codigoSancionado: cnpj }, 3, opcoes);
  await esperar(opcoes.pausaMs ?? PAUSA_MS);
  const cnep = await paginas("cnep", { codigoSancionado: cnpj }, 3, opcoes);
  return [...interpretarSancoes(ceis.itens, "CEIS"), ...interpretarSancoes(cnep.itens, "CNEP")];
}
