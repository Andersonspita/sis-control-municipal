// Catálogo dos provedores de IA aceitos (sem dependências: usado também pelo formulário no navegador).

/** Dimensão da coluna trechos_documento.embedding (vector(1536)). */
export const DIMENSOES_EMBEDDING = 1536;

export const PROVEDORES_IA = ["OPENAI", "ANTHROPIC", "GOOGLE", "OPENAI_COMPATIVEL"] as const;
export type TipoProvedor = (typeof PROVEDORES_IA)[number];

/** A Anthropic não oferece embeddings; os demais servem para texto e embeddings. */
export const PROVEDORES_EMBEDDINGS = ["OPENAI", "GOOGLE", "OPENAI_COMPATIVEL"] as const;
export type TipoProvedorEmbeddings = (typeof PROVEDORES_EMBEDDINGS)[number];

export function ehProvedor(valor: unknown): valor is TipoProvedor {
  return typeof valor === "string" && (PROVEDORES_IA as readonly string[]).includes(valor);
}

export function ehProvedorEmbeddings(valor: unknown): valor is TipoProvedorEmbeddings {
  return typeof valor === "string" && (PROVEDORES_EMBEDDINGS as readonly string[]).includes(valor);
}

export type InfoProvedor = {
  rotulo: string;
  modeloTexto: string;
  /** Nulo quando o provedor não gera embeddings. */
  modeloEmbeddings: string | null;
  sugestoesTexto: string[];
  sugestoesEmbeddings: string[];
  /** Prefixo usado na máscara da chave (ex.: "sk-…abcd"). */
  prefixoChave: string;
  exemploChave: string;
  /** Variável de ambiente usada quando não há chave cadastrada. */
  variavelAmbiente: string | null;
  urlPadrao: string | null;
  ajuda: string;
};

export const INFO_PROVEDOR: Record<TipoProvedor, InfoProvedor> = {
  OPENAI: {
    rotulo: "OpenAI",
    modeloTexto: "gpt-4.1-mini",
    modeloEmbeddings: "text-embedding-3-small",
    sugestoesTexto: ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "gpt-4o-mini", "gpt-4o", "o4-mini"],
    sugestoesEmbeddings: ["text-embedding-3-small", "text-embedding-3-large"],
    prefixoChave: "sk-",
    exemploChave: "sk-...",
    variavelAmbiente: "OPENAI_API_KEY",
    urlPadrao: "https://api.openai.com/v1",
    ajuda: "Chave criada em platform.openai.com › API keys.",
  },
  ANTHROPIC: {
    rotulo: "Anthropic (Claude)",
    modeloTexto: "claude-sonnet-4-5",
    modeloEmbeddings: null,
    sugestoesTexto: ["claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1", "claude-sonnet-4"],
    sugestoesEmbeddings: [],
    prefixoChave: "sk-ant-",
    exemploChave: "sk-ant-...",
    variavelAmbiente: "ANTHROPIC_API_KEY",
    urlPadrao: "https://api.anthropic.com",
    ajuda: "Chave criada em console.anthropic.com › API keys. A Anthropic não gera embeddings: escolha outro provedor para eles.",
  },
  GOOGLE: {
    rotulo: "Google (Gemini)",
    modeloTexto: "gemini-2.5-flash",
    modeloEmbeddings: "gemini-embedding-001",
    sugestoesTexto: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
    sugestoesEmbeddings: ["gemini-embedding-001"],
    prefixoChave: "",
    exemploChave: "AIza...",
    variavelAmbiente: "GEMINI_API_KEY",
    urlPadrao: "https://generativelanguage.googleapis.com/v1beta",
    ajuda: "Chave criada em aistudio.google.com › Get API key.",
  },
  OPENAI_COMPATIVEL: {
    rotulo: "Compatível com a API da OpenAI",
    modeloTexto: "",
    modeloEmbeddings: "",
    sugestoesTexto: ["deepseek-chat", "llama-3.3-70b-versatile", "mistral-large-latest", "openai/gpt-4.1-mini", "llama3.1:8b"],
    sugestoesEmbeddings: ["text-embedding-3-small", "openai/text-embedding-3-small"],
    prefixoChave: "",
    exemploChave: "Chave do serviço (dispensável em servidores locais)",
    variavelAmbiente: null,
    urlPadrao: null,
    ajuda: "Groq, DeepSeek, Mistral, OpenRouter, Azure OpenAI, Ollama, LM Studio e outros serviços que seguem a API da OpenAI.",
  },
};

/** Exemplos de URL base para o provedor compatível. */
export const EXEMPLOS_URL_COMPATIVEL = [
  { nome: "Groq", url: "https://api.groq.com/openai/v1" },
  { nome: "DeepSeek", url: "https://api.deepseek.com/v1" },
  { nome: "Mistral", url: "https://api.mistral.ai/v1" },
  { nome: "OpenRouter", url: "https://openrouter.ai/api/v1" },
  { nome: "Azure OpenAI", url: "https://SEU-RECURSO.openai.azure.com/openai/v1" },
  { nome: "Ollama", url: "http://localhost:11434/v1" },
  { nome: "LM Studio", url: "http://localhost:1234/v1" },
];

export function mascararChave(final: string | null | undefined, provedor: TipoProvedor = "OPENAI") {
  return final ? `${INFO_PROVEDOR[provedor].prefixoChave}…${final}` : null;
}
