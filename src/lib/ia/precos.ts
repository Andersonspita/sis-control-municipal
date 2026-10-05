// Preços em US$ por 1 milhão de tokens (tabelas públicas da OpenAI, Anthropic, Google e dos serviços
// compatíveis mais comuns; atualize quando os provedores mudarem).
// O custo gravado em cada análise é uma estimativa a partir dos tokens informados pela API.

export const PRECOS_TEXTO_USD_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  // OpenAI
  "gpt-4.1": { entrada: 2.0, saida: 8.0 },
  "gpt-4.1-mini": { entrada: 0.4, saida: 1.6 },
  "gpt-4.1-nano": { entrada: 0.1, saida: 0.4 },
  "gpt-4o": { entrada: 2.5, saida: 10.0 },
  "gpt-4o-mini": { entrada: 0.15, saida: 0.6 },
  "o4-mini": { entrada: 1.1, saida: 4.4 },
  // Anthropic
  "claude-opus-4-1": { entrada: 15.0, saida: 75.0 },
  "claude-opus-4": { entrada: 15.0, saida: 75.0 },
  "claude-sonnet-4-5": { entrada: 3.0, saida: 15.0 },
  "claude-sonnet-4": { entrada: 3.0, saida: 15.0 },
  "claude-3-7-sonnet": { entrada: 3.0, saida: 15.0 },
  "claude-haiku-4-5": { entrada: 1.0, saida: 5.0 },
  "claude-3-5-haiku": { entrada: 0.8, saida: 4.0 },
  // Google (Gemini; faixa de até 200 mil tokens de entrada)
  "gemini-2.5-pro": { entrada: 1.25, saida: 10.0 },
  "gemini-2.5-flash": { entrada: 0.3, saida: 2.5 },
  "gemini-2.5-flash-lite": { entrada: 0.1, saida: 0.4 },
  "gemini-2.0-flash": { entrada: 0.1, saida: 0.4 },
  // Serviços compatíveis com a OpenAI
  "deepseek-chat": { entrada: 0.27, saida: 1.1 },
  "deepseek-reasoner": { entrada: 0.55, saida: 2.19 },
  "llama-3.3-70b-versatile": { entrada: 0.59, saida: 0.79 },
  "mistral-large-latest": { entrada: 2.0, saida: 6.0 },
  "mistral-small-latest": { entrada: 0.1, saida: 0.3 },
};

export const PRECOS_EMBEDDINGS_USD_POR_MILHAO: Record<string, number> = {
  "text-embedding-3-small": 0.02,
  "text-embedding-3-large": 0.13,
  "text-embedding-ada-002": 0.1,
  "gemini-embedding-001": 0.15,
};

/** Modelo fora da tabela: estima pelo preço do gpt-4.1 (conservador, para não estourar o limite). */
const PRECO_TEXTO_DESCONHECIDO = { entrada: 2.0, saida: 8.0 };
const PRECO_EMBEDDINGS_DESCONHECIDO = 0.13;

/**
 * Procura o modelo exato ou a chave mais longa que é prefixo (ex.: "gpt-4.1-mini-2025-04-14").
 * Ignora o prefixo de roteadores como OpenRouter ("anthropic/claude-sonnet-4-5") e o "models/" do Gemini.
 */
function procurar<T>(tabela: Record<string, T>, nome: string): T | undefined {
  const modelo = nome.slice(nome.lastIndexOf("/") + 1);
  if (tabela[modelo]) return tabela[modelo];
  const chave = Object.keys(tabela)
    .filter((k) => modelo.startsWith(`${k}-`))
    .sort((a, b) => b.length - a.length)[0];
  return chave ? tabela[chave] : undefined;
}

export function custoTextoUsd(modelo: string, tokensEntrada: number, tokensSaida: number) {
  const p = procurar(PRECOS_TEXTO_USD_POR_MILHAO, modelo) ?? PRECO_TEXTO_DESCONHECIDO;
  return (tokensEntrada * p.entrada + tokensSaida * p.saida) / 1_000_000;
}

export function custoEmbeddingsUsd(modelo: string, tokens: number) {
  return (tokens * (procurar(PRECOS_EMBEDDINGS_USD_POR_MILHAO, modelo) ?? PRECO_EMBEDDINGS_DESCONHECIDO)) / 1_000_000;
}

/** Limite atingido quando o gasto do mês já alcançou o valor configurado (sem limite = nunca). */
export function limiteAtingido(gastoMesUsd: number, limiteMensalUsd: number | null) {
  return limiteMensalUsd !== null && gastoMesUsd >= limiteMensalUsd;
}
