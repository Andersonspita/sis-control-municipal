import "server-only";
import { db } from "@/lib/db";
import { decifrar } from "@/lib/cripto";
import { CHAVE_DISPENSADA } from "./provedor";
import {
  ehProvedor,
  ehProvedorEmbeddings,
  INFO_PROVEDOR,
  type TipoProvedor,
  type TipoProvedorEmbeddings,
} from "./provedores";

export { mascararChave } from "./provedores";

export const MODELO_TEXTO_PADRAO = INFO_PROVEDOR.OPENAI.modeloTexto;
export const MODELO_EMBEDDINGS_PADRAO = INFO_PROVEDOR.OPENAI.modeloEmbeddings!;
export const SUGESTOES_MODELO_TEXTO = INFO_PROVEDOR.OPENAI.sugestoesTexto;
export const SUGESTOES_MODELO_EMBEDDINGS = INFO_PROVEDOR.OPENAI.sugestoesEmbeddings;

/**
 * Contextos de cifragem das chaves: um valor cifrado para outro uso não é aceito aqui.
 * O nome histórico "chave_openai" vale para a chave do provedor de texto, qualquer que seja ele.
 */
export const CONTEXTO_CHAVE_OPENAI = "configuracoes_ia.chave_openai";
export const CONTEXTO_CHAVE_IA = CONTEXTO_CHAVE_OPENAI;
export const CONTEXTO_CHAVE_EMBEDDINGS = "configuracoes_ia.chave_embeddings";

type OrigemChave = "banco" | "ambiente" | null;

export type ConexaoEmbeddings = {
  provedor: TipoProvedorEmbeddings;
  chave: string | null;
  urlBase: string | null;
  origemChave: OrigemChave;
  /** Falso quando usa o mesmo provedor e a mesma chave do texto. */
  separado: boolean;
};

export type ConfigIA = {
  habilitada: boolean;
  provedor: TipoProvedor;
  urlBase: string | null;
  chave: string | null;
  origemChave: OrigemChave;
  modeloTexto: string;
  modeloEmbeddings: string;
  /** Nulo quando o provedor de texto não gera embeddings e nenhum outro foi configurado. */
  embeddings: ConexaoEmbeddings | null;
  limiteMensalUsd: number | null;
  /** Motivo, para exibição, de a IA não poder ser usada mesmo habilitada. */
  pendencia: string | null;
};

/** Chave da variável de ambiente do provedor (ex.: OPENAI_API_KEY), usada quando não há chave cadastrada. */
export function chaveDoAmbiente(provedor: TipoProvedor) {
  if (provedor === "GOOGLE") return process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || null;
  const variavel = INFO_PROVEDOR[provedor].variavelAmbiente;
  return (variavel && process.env[variavel]?.trim()) || null;
}

function resolverChave(provedor: TipoProvedor, cifrada: string | null | undefined, contexto: string) {
  const banco = cifrada ? decifrar(cifrada, contexto) : null;
  const ambiente = banco ? null : chaveDoAmbiente(provedor);
  const chave = banco ?? ambiente ?? (provedor === "OPENAI_COMPATIVEL" ? CHAVE_DISPENSADA : null);
  return { chave, origemChave: (banco ? "banco" : ambiente ? "ambiente" : null) as OrigemChave };
}

/**
 * Configuração efetiva da IA (uso exclusivo da controladoria, nunca do satélite).
 * As chaves cadastradas em Configurações › Inteligência artificial têm prioridade; sem elas, vale a
 * variável de ambiente do provedor (OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY).
 * Deve ser chamada fora de `comCliente`: a política de RLS só libera a tabela sem contexto de
 * cliente (código do servidor) ou para o administrador.
 */
export async function obterConfigIA(): Promise<ConfigIA> {
  const linha = await db.configuracaoIA.findUnique({ where: { id: 1 } });
  const provedor: TipoProvedor = ehProvedor(linha?.provedor) ? linha.provedor : "OPENAI";
  const urlBase = linha?.urlBase ?? null;
  const texto = resolverChave(provedor, linha?.chaveCifrada, CONTEXTO_CHAVE_IA);

  let embeddings: ConexaoEmbeddings | null = null;
  if (ehProvedorEmbeddings(linha?.provedorEmbeddings)) {
    const pe = linha.provedorEmbeddings;
    const r = resolverChave(pe, linha.chaveEmbeddingsCifrada, CONTEXTO_CHAVE_EMBEDDINGS);
    embeddings = { provedor: pe, urlBase: linha.urlBaseEmbeddings ?? null, ...r, separado: true };
  } else if (ehProvedorEmbeddings(provedor)) {
    embeddings = { provedor, urlBase, ...texto, separado: false };
  }

  const rotulo = INFO_PROVEDOR[provedor].rotulo;
  const pendencia = !texto.chave
    ? `Nenhuma chave da API cadastrada para ${rotulo}.`
    : !embeddings
      ? `${rotulo} não gera embeddings: configure um provedor de embeddings.`
      : !embeddings.chave
        ? `Nenhuma chave da API cadastrada para os embeddings (${INFO_PROVEDOR[embeddings.provedor].rotulo}).`
        : null;

  return {
    habilitada: (linha ? linha.habilitada : true) && pendencia === null,
    provedor,
    urlBase,
    ...texto,
    modeloTexto: linha?.modeloTexto ?? MODELO_TEXTO_PADRAO,
    modeloEmbeddings: linha?.modeloEmbeddings ?? MODELO_EMBEDDINGS_PADRAO,
    embeddings,
    limiteMensalUsd: linha?.limiteMensalUsd ? Number(linha.limiteMensalUsd) : null,
    pendencia,
  };
}

export type ResultadoTeste = { ok: boolean; status: number | null; mensagem: string; modelos?: string[] };

const TEMPO_LIMITE_MS = 10_000;

/** Endereço e cabeçalhos da listagem de modelos de cada provedor (consulta gratuita que valida a chave). */
function requisicaoModelos(provedor: TipoProvedor, chave: string | null, urlBase: string | null) {
  const base = (urlBase || INFO_PROVEDOR[provedor].urlPadrao || "").replace(/\/+$/, "");
  switch (provedor) {
    case "ANTHROPIC":
      return {
        url: `${base.replace(/\/v1$/, "")}/v1/models?limit=1000`,
        headers: { "x-api-key": chave ?? "", "anthropic-version": "2023-06-01" } as Record<string, string>,
      };
    case "GOOGLE":
      return { url: `${base}/models?pageSize=1000`, headers: { "x-goog-api-key": chave ?? "" } as Record<string, string> };
    case "OPENAI":
      return { url: `${base}/models`, headers: { Authorization: `Bearer ${chave}` } as Record<string, string> };
    case "OPENAI_COMPATIVEL":
      // Azure OpenAI aceita "api-key"; os demais, o cabeçalho Authorization.
      return {
        url: `${base}/models`,
        headers: (chave && chave !== CHAVE_DISPENSADA ? { Authorization: `Bearer ${chave}`, "api-key": chave } : {}) as Record<
          string,
          string
        >,
      };
  }
}

function idsDosModelos(provedor: TipoProvedor, corpo: unknown): string[] {
  const c = corpo as { data?: { id?: unknown }[]; models?: { name?: unknown }[] } | null;
  if (provedor === "GOOGLE") {
    return (c?.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === "string")
      .map((n) => n.replace(/^models\//, ""));
  }
  return (c?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
}

/** O modelo consta da lista, exatamente ou como apelido de uma versão datada (ex.: claude-sonnet-4-5-20250929). */
export function modeloNaLista(modelo: string, lista: string[]) {
  const m = modelo.trim().replace(/^models\//, "");
  return lista.some((id) => id === m || id.startsWith(`${m}-`));
}

/** Lista os modelos do provedor para validar chave e endereço; devolve mensagem pronta para o usuário. */
export async function testarConexao(provedor: TipoProvedor, chave: string | null, urlBase: string | null): Promise<ResultadoTeste> {
  const rotulo = INFO_PROVEDOR[provedor].rotulo;
  if (provedor === "OPENAI_COMPATIVEL" && !urlBase) {
    return { ok: false, status: null, mensagem: "Informe a URL base do serviço compatível com a OpenAI." };
  }
  if (provedor !== "OPENAI_COMPATIVEL" && !chave) {
    return { ok: false, status: null, mensagem: `Nenhuma chave cadastrada para ${rotulo}. Digite uma chave para testar.` };
  }

  const { url, headers } = requisicaoModelos(provedor, chave, urlBase);
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    return { ok: false, status: null, mensagem: "A URL base informada não é um endereço válido (ex.: https://api.exemplo.com/v1)." };
  }

  let resposta: Response;
  try {
    resposta = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(TEMPO_LIMITE_MS) });
  } catch (err) {
    const tempoEsgotado = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: null,
      mensagem: tempoEsgotado
        ? `${rotulo} não respondeu em ${TEMPO_LIMITE_MS / 1000} segundos (${host}). Tente novamente.`
        : provedor === "OPENAI_COMPATIVEL"
          ? `Não foi possível conectar a ${host}. Confira a URL base e se o serviço está no ar e acessível a partir do servidor.`
          : `Falha de rede ao acessar ${host}. Verifique a conexão do servidor com a internet.`,
    };
  }

  if (resposta.ok) {
    const modelos = idsDosModelos(provedor, await resposta.json().catch(() => null));
    return { ok: true, status: resposta.status, mensagem: `Conexão com ${rotulo} funcionando.`, modelos };
  }

  const mensagens: Record<number, string> = {
    401: `Chave inválida ou revogada (401). Confira a chave no painel de ${rotulo}.`,
    403: `A chave não tem permissão para listar modelos (403). Verifique o projeto e as permissões da chave.`,
    404:
      provedor === "OPENAI_COMPATIVEL"
        ? "Endereço não encontrado (404). Confira a URL base; normalmente ela termina em /v1."
        : `Endereço não encontrado em ${host} (404). Confira a URL base.`,
    429: `Limite de requisições ou cota esgotada (429). Verifique o faturamento da conta em ${rotulo}.`,
  };
  // O Google responde 400 para chave inválida.
  if (provedor === "GOOGLE") mensagens[400] = "Chave inválida (400). Confira a chave no Google AI Studio.";
  return {
    ok: false,
    status: resposta.status,
    mensagem:
      mensagens[resposta.status] ??
      (resposta.status >= 500
        ? `${rotulo} está instável no momento (${resposta.status}). Tente mais tarde.`
        : `${rotulo} recusou a requisição (${resposta.status}).`),
  };
}

/** Mantida por compatibilidade: testa uma chave da OpenAI. */
export function testarChaveOpenAI(chave: string) {
  return testarConexao("OPENAI", chave, null);
}
