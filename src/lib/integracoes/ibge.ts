import { z } from "zod";
import { buscarJson, ErroIntegracao, type Buscador } from "./http";
import type { DadosIbge } from "./tipos";

// API de serviços de dados do IBGE (pública, sem chave): https://servicodados.ibge.gov.br/api/docs
const BASE = "https://servicodados.ibge.gov.br/api";
const FONTE = "IBGE";

/** Tabelas SIDRA de população: estimativa anual (6579, variável 9324) e Censo 2022 (4709, variável 93). */
export const TABELAS_POPULACAO = [
  { tabela: 6579, variavel: 9324, tipo: "ESTIMATIVA" },
  { tabela: 4709, variavel: 93, tipo: "CENSO" },
] as const;

const esquemaMunicipio = z.object({
  "municipio-id": z.coerce.number(),
  "municipio-nome": z.string(),
  "UF-sigla": z.string(),
  "microrregiao-nome": z.string().nullish(),
  "regiao-imediata-nome": z.string().nullish(),
});

export type MunicipioIbge = { codigo: string; nome: string; uf: string; microrregiao: string | null; regiaoImediata: string | null };

function paraMunicipio(m: z.infer<typeof esquemaMunicipio>): MunicipioIbge {
  return {
    codigo: String(m["municipio-id"]),
    nome: m["municipio-nome"],
    uf: m["UF-sigla"],
    microrregiao: m["microrregiao-nome"] ?? null,
    regiaoImediata: m["regiao-imediata-nome"] ?? null,
  };
}

const cacheUf = new Map<string, { em: number; lista: MunicipioIbge[] }>();
const VALIDADE_CACHE_MS = 24 * 60 * 60 * 1000;

export async function listarMunicipios(uf: string, buscador?: Buscador): Promise<MunicipioIbge[]> {
  const sigla = uf.toUpperCase();
  if (!/^[A-Z]{2}$/.test(sigla)) throw new ErroIntegracao("UF inválida.");
  const emCache = cacheUf.get(sigla);
  if (emCache && Date.now() - emCache.em < VALIDADE_CACHE_MS) return emCache.lista;
  const json = await buscarJson(`${BASE}/v1/localidades/estados/${sigla}/municipios?view=nivelado`, { fonte: FONTE, buscador });
  const lista = z.array(esquemaMunicipio).parse(json).map(paraMunicipio);
  lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  if (!buscador) cacheUf.set(sigla, { em: Date.now(), lista });
  return lista;
}

export async function buscarMunicipio(codigo: string, buscador?: Buscador): Promise<MunicipioIbge | null> {
  if (!/^\d{7}$/.test(codigo)) throw new ErroIntegracao("O código IBGE tem 7 dígitos.");
  const json = await buscarJson(`${BASE}/v1/localidades/municipios/${codigo}?view=nivelado`, { fonte: FONTE, buscador });
  // Código inexistente: a API responde 200 com lista ou objeto vazio.
  if (!json || (Array.isArray(json) && !json.length) || (typeof json === "object" && !Object.keys(json).length)) return null;
  return paraMunicipio(esquemaMunicipio.parse(Array.isArray(json) ? json[0] : json));
}

const esquemaAgregado = z.array(
  z.object({
    resultados: z.array(
      z.object({
        series: z.array(z.object({ serie: z.record(z.string(), z.string().nullable()) })),
      }),
    ),
  }),
);

/** Valor mais recente de uma série SIDRA (ignora "-", "..." e vazios). */
export function interpretarAgregado(json: unknown): { ano: string; valor: number } | null {
  const serie = esquemaAgregado.parse(json)[0]?.resultados[0]?.series[0]?.serie ?? {};
  const anos = Object.keys(serie).sort().reverse();
  for (const ano of anos) {
    const valor = Number(serie[ano]);
    if (serie[ano] && Number.isFinite(valor) && valor > 0) return { ano, valor };
  }
  return null;
}

export async function obterPopulacao(codigo: string, buscador?: Buscador) {
  for (const t of TABELAS_POPULACAO) {
    const url = `${BASE}/v3/agregados/${t.tabela}/periodos/-1/variaveis/${t.variavel}?localidades=N6[${codigo}]`;
    try {
      const r = interpretarAgregado(await buscarJson(url, { fonte: FONTE, buscador }));
      if (r) return { populacao: r.valor, ano: r.ano, tipo: t.tipo };
    } catch (err) {
      // Estimativa indisponível: tenta o Censo antes de desistir.
      if (t === TABELAS_POPULACAO[TABELAS_POPULACAO.length - 1]) throw err;
    }
  }
  return null;
}

export async function coletarIbge(codigo: string, buscador?: Buscador): Promise<DadosIbge | null> {
  const municipio = await buscarMunicipio(codigo, buscador);
  if (!municipio) return null;
  const pop = await obterPopulacao(codigo, buscador);
  return {
    codigoIbge: municipio.codigo,
    municipio: municipio.nome,
    uf: municipio.uf,
    microrregiao: municipio.microrregiao,
    regiaoImediata: municipio.regiaoImediata,
    populacao: pop?.populacao ?? null,
    anoPopulacao: pop?.ano ?? null,
    tipoPopulacao: pop?.tipo ?? null,
  };
}

/** Compara nomes de município sem acento nem caixa. */
export function normalizarNome(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
