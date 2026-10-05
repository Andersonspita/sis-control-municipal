import "server-only";
import { db } from "@/lib/db";
import { decifrar } from "@/lib/cripto";

export const MODELO_TEXTO_PADRAO = "gpt-4.1-mini";
export const MODELO_EMBEDDINGS_PADRAO = "text-embedding-3-small";
export const SUGESTOES_MODELO_TEXTO = ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "o4-mini"];
export const SUGESTOES_MODELO_EMBEDDINGS = ["text-embedding-3-small", "text-embedding-3-large"];

/** Contexto de cifragem da chave: um valor cifrado para outro uso não é aceito aqui. */
export const CONTEXTO_CHAVE_OPENAI = "configuracoes_ia.chave_openai";

export type ConfigIA = {
  habilitada: boolean;
  chave: string | null;
  origemChave: "banco" | "ambiente" | null;
  modeloTexto: string;
  modeloEmbeddings: string;
  limiteMensalUsd: number | null;
};

export function mascararChave(final: string | null | undefined) {
  return final ? `sk-…${final}` : null;
}

/**
 * Configuração efetiva da IA (uso exclusivo da controladoria, nunca do satélite).
 * A chave cadastrada em /admin/ia tem prioridade; sem ela, vale OPENAI_API_KEY do ambiente.
 * Deve ser chamada fora de `comCliente`: a política de RLS só libera a tabela sem contexto de
 * cliente (código do servidor) ou para o administrador.
 */
export async function obterConfigIA(): Promise<ConfigIA> {
  const linha = await db.configuracaoIA.findUnique({ where: { id: 1 } });
  const doAmbiente = process.env.OPENAI_API_KEY?.trim() || null;
  const chave = linha?.chaveCifrada ? decifrar(linha.chaveCifrada, CONTEXTO_CHAVE_OPENAI) : doAmbiente;
  return {
    habilitada: (linha ? linha.habilitada : true) && chave !== null,
    chave,
    origemChave: linha?.chaveCifrada ? "banco" : doAmbiente ? "ambiente" : null,
    modeloTexto: linha?.modeloTexto ?? MODELO_TEXTO_PADRAO,
    modeloEmbeddings: linha?.modeloEmbeddings ?? MODELO_EMBEDDINGS_PADRAO,
    limiteMensalUsd: linha?.limiteMensalUsd ? Number(linha.limiteMensalUsd) : null,
  };
}

export type ResultadoTeste = { ok: boolean; status: number | null; mensagem: string; modelos?: string[] };

const TEMPO_LIMITE_MS = 10_000;

/** Consulta GET /v1/models para validar a chave; devolve mensagem pronta para o usuário. */
export async function testarChaveOpenAI(chave: string): Promise<ResultadoTeste> {
  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${chave}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
  } catch (err) {
    const tempoEsgotado = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false,
      status: null,
      mensagem: tempoEsgotado
        ? `A OpenAI não respondeu em ${TEMPO_LIMITE_MS / 1000} segundos. Tente novamente.`
        : "Falha de rede ao acessar api.openai.com. Verifique a conexão do servidor com a internet.",
    };
  }

  if (resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
    const modelos = (corpo?.data ?? []).map((m) => m.id).filter((id): id is string => typeof id === "string");
    return { ok: true, status: resposta.status, mensagem: "Conexão com a OpenAI funcionando.", modelos };
  }

  const mensagens: Record<number, string> = {
    401: "Chave inválida ou revogada (401). Confira a chave no painel da OpenAI.",
    403: "A chave não tem permissão para listar modelos (403). Verifique o projeto e as permissões da chave.",
    429: "Limite de requisições ou cota esgotada (429). Verifique o faturamento da conta OpenAI.",
  };
  return {
    ok: false,
    status: resposta.status,
    mensagem:
      mensagens[resposta.status] ??
      (resposta.status >= 500
        ? `A OpenAI está instável no momento (${resposta.status}). Tente mais tarde.`
        : `A OpenAI recusou a requisição (${resposta.status}).`),
  };
}
