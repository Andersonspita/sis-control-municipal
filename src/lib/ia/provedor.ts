// Provedores de IA: OpenAI e APIs compatíveis (SDK openai), Anthropic (SDK oficial), Google Gemini (REST)
// e um falso determinístico (IA_PROVEDOR=falso) para testes e dev sem chave.
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { z } from "zod";
import { DIMENSOES_EMBEDDING, INFO_PROVEDOR, type TipoProvedor } from "./provedores";

export { DIMENSOES_EMBEDDING };

export type PedidoJson<T> = {
  modelo: string;
  /** Nome do esquema/ferramenta enviado ao provedor (letras, números e _). */
  nome: string;
  sistema: string;
  usuario: string;
  esquema: z.ZodType<T>;
  /** Resposta do provedor falso, calculada a partir da própria entrada. */
  simular: () => unknown;
};

export type RespostaJson<T> = { dados: T; tokensEntrada: number; tokensSaida: number };

export interface ProvedorIA {
  readonly nome: "openai" | "anthropic" | "google" | "openai_compativel" | "falso";
  embeddings(textos: string[], modelo: string): Promise<{ vetores: number[][]; tokens: number }>;
  gerarJson<T>(pedido: PedidoJson<T>): Promise<RespostaJson<T>>;
}

export type ConexaoIA = { provedor: TipoProvedor; chave: string | null; urlBase: string | null };
/** Conexão do texto e, opcionalmente, outra para os embeddings (ausente = a mesma do texto). */
export type ConfigProvedor = ConexaoIA & { embeddings?: ConexaoIA | null };

/** Valor enviado como chave a serviços compatíveis que não exigem chave (ex.: Ollama local). */
export const CHAVE_DISPENSADA = "nao-necessaria";

/** Saídas estruturadas em modo estrito exigem todas as propriedades em `required` e nenhuma propriedade extra. */
function paraEsquemaEstrito(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(paraEsquemaEstrito);
  if (!no || typeof no !== "object") return no;
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(no)) if (k !== "$schema") o[k] = paraEsquemaEstrito(v);
  if (o.type === "object" && o.properties && typeof o.properties === "object") {
    o.required = Object.keys(o.properties);
    o.additionalProperties = false;
  }
  return o;
}

export function esquemaJson(esquema: z.ZodType) {
  return paraEsquemaEstrito(z.toJSONSchema(esquema, { target: "draft-7" })) as Record<string, unknown>;
}

/** Lê o JSON da resposta; alguns modelos o cercam com ```json ou com texto antes/depois. */
export function extrairJson(texto: string): unknown {
  const t = texto.trim();
  const corpo = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t)?.[1] ?? t;
  try {
    return JSON.parse(corpo);
  } catch {
    const inicio = corpo.indexOf("{");
    const fim = corpo.lastIndexOf("}");
    if (inicio >= 0 && fim > inicio) return JSON.parse(corpo.slice(inicio, fim + 1));
    throw new Error("O modelo não devolveu um JSON válido.");
  }
}

function instrucaoJson(esquema: z.ZodType) {
  return `Responda somente com um objeto JSON válido, sem texto antes ou depois, seguindo exatamente este JSON Schema:\n${JSON.stringify(esquemaJson(esquema))}`;
}

function statusDoErro(err: unknown) {
  return err && typeof err === "object" && "status" in err && typeof err.status === "number" ? err.status : null;
}

/** 400/422: o serviço não aceitou um parâmetro opcional (ex.: json_schema ou dimensions). */
function recusouParametro(err: unknown) {
  const s = statusDoErro(err);
  return s === 400 || s === 422;
}

function conferirDimensoes(vetores: number[][], modelo: string) {
  const errado = vetores.find((v) => v.length !== DIMENSOES_EMBEDDING);
  if (errado) {
    throw new Error(
      `O modelo de embeddings ${modelo} gerou vetores de ${errado.length} dimensões; o sistema exige ${DIMENSOES_EMBEDDING}. Escolha um modelo que gere (ou aceite reduzir para) ${DIMENSOES_EMBEDDING} dimensões.`,
    );
  }
}

const estimarTokens = (textos: string[]) => Math.ceil(textos.reduce((s, t) => s + t.length, 0) / 4);

const LOTE_EMBEDDINGS = 96;
const TEMPO_LIMITE_MS = 120_000;
const MAX_TOKENS_SAIDA = 8192;

class ProvedorOpenAI implements ProvedorIA {
  readonly nome: "openai" | "openai_compativel";
  private cliente: OpenAI;
  private aceitaEsquema = true;
  private aceitaDimensoes = true;

  constructor(
    chave: string | null,
    urlBase: string | null,
    private compativel: boolean,
  ) {
    this.nome = compativel ? "openai_compativel" : "openai";
    this.cliente = new OpenAI({
      apiKey: chave || CHAVE_DISPENSADA,
      baseURL: urlBase || undefined,
      timeout: TEMPO_LIMITE_MS,
      maxRetries: 2,
    });
  }

  private async criarEmbeddings(modelo: string, input: string[]) {
    const pedirDimensoes = this.compativel ? this.aceitaDimensoes : modelo.startsWith("text-embedding-3");
    const base = { model: modelo, input, encoding_format: "float" as const };
    try {
      return await this.cliente.embeddings.create({ ...base, ...(pedirDimensoes ? { dimensions: DIMENSOES_EMBEDDING } : {}) });
    } catch (err) {
      if (!this.compativel || !pedirDimensoes || !recusouParametro(err)) throw err;
      this.aceitaDimensoes = false;
      return this.cliente.embeddings.create(base);
    }
  }

  async embeddings(textos: string[], modelo: string) {
    const vetores: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < textos.length; i += LOTE_EMBEDDINGS) {
      const lote = textos.slice(i, i + LOTE_EMBEDDINGS);
      const r = await this.criarEmbeddings(modelo, lote);
      vetores.push(...[...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
      tokens += r.usage?.prompt_tokens ?? estimarTokens(lote);
    }
    conferirDimensoes(vetores, modelo);
    return { vetores, tokens };
  }

  async gerarJson<T>(p: PedidoJson<T>): Promise<RespostaJson<T>> {
    if (!this.compativel) {
      const r = await this.cliente.responses.create({
        model: p.modelo,
        instructions: p.sistema,
        input: p.usuario,
        text: { format: { type: "json_schema", name: p.nome, schema: esquemaJson(p.esquema), strict: true } },
      });
      const dados = p.esquema.parse(JSON.parse(r.output_text));
      return { dados, tokensEntrada: r.usage?.input_tokens ?? 0, tokensSaida: r.usage?.output_tokens ?? 0 };
    }

    // Serviços compatíveis: tenta saída estruturada estrita; se recusada, modo JSON com o esquema nas instruções.
    let r: OpenAI.Chat.Completions.ChatCompletion | null = null;
    if (this.aceitaEsquema) {
      try {
        r = await this.cliente.chat.completions.create({
          model: p.modelo,
          messages: [
            { role: "system", content: p.sistema },
            { role: "user", content: p.usuario },
          ],
          response_format: { type: "json_schema", json_schema: { name: p.nome, schema: esquemaJson(p.esquema), strict: true } },
        });
      } catch (err) {
        if (!recusouParametro(err)) throw err;
        this.aceitaEsquema = false;
      }
    }
    r ??= await this.cliente.chat.completions.create({
      model: p.modelo,
      messages: [
        { role: "system", content: `${p.sistema}\n\n${instrucaoJson(p.esquema)}` },
        { role: "user", content: p.usuario },
      ],
      response_format: { type: "json_object" },
    });
    const dados = p.esquema.parse(extrairJson(r.choices[0]?.message?.content ?? ""));
    return { dados, tokensEntrada: r.usage?.prompt_tokens ?? 0, tokensSaida: r.usage?.completion_tokens ?? 0 };
  }
}

class ProvedorAnthropic implements ProvedorIA {
  readonly nome = "anthropic" as const;
  private cliente: Anthropic;

  constructor(chave: string, urlBase: string | null) {
    this.cliente = new Anthropic({ apiKey: chave, baseURL: urlBase || undefined, timeout: TEMPO_LIMITE_MS, maxRetries: 2 });
  }

  async embeddings(): Promise<never> {
    throw new Error("A Anthropic não oferece embeddings. Configure um provedor de embeddings em Configurações › Inteligência artificial.");
  }

  /** Saída estruturada via ferramenta obrigatória: o modelo devolve os dados como entrada da ferramenta. */
  async gerarJson<T>(p: PedidoJson<T>): Promise<RespostaJson<T>> {
    const r = await this.cliente.messages.create({
      model: p.modelo,
      max_tokens: MAX_TOKENS_SAIDA,
      system: p.sistema,
      messages: [{ role: "user", content: p.usuario }],
      tools: [
        {
          name: p.nome,
          description: "Registra a resposta no formato estruturado exigido.",
          input_schema: esquemaJson(p.esquema) as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: "tool", name: p.nome },
    });
    const bloco = r.content.find((b) => b.type === "tool_use");
    if (!bloco || r.stop_reason === "max_tokens") {
      throw new Error(
        r.stop_reason === "max_tokens"
          ? "A resposta do modelo excedeu o limite de tokens de saída."
          : "O modelo não devolveu a resposta estruturada.",
      );
    }
    return { dados: p.esquema.parse(bloco.input), tokensEntrada: r.usage.input_tokens, tokensSaida: r.usage.output_tokens };
  }
}

type RespostaGemini = {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

class ProvedorGoogle implements ProvedorIA {
  readonly nome = "google" as const;
  private base: string;

  constructor(
    private chave: string,
    urlBase: string | null,
  ) {
    this.base = (urlBase || INFO_PROVEDOR.GOOGLE.urlPadrao!).replace(/\/+$/, "");
  }

  private async chamar<R>(caminho: string, corpo: unknown): Promise<R> {
    let erro: Error | null = null;
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (tentativa) await esperar(1000 * 2 ** tentativa);
      const r = await fetch(`${this.base}/${caminho}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": this.chave },
        body: JSON.stringify(corpo),
        cache: "no-store",
        signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
      if (r.ok) return (await r.json()) as R;
      const detalhe = ((await r.json().catch(() => null)) as { error?: { message?: string } } | null)?.error?.message;
      erro = Object.assign(new Error(`O Google Gemini recusou a requisição (${r.status})${detalhe ? `: ${detalhe}` : "."}`), {
        status: r.status,
      });
      if (r.status !== 429 && r.status < 500) break;
    }
    throw erro;
  }

  private modelo(m: string) {
    return m.replace(/^models\//, "");
  }

  async embeddings(textos: string[], modelo: string) {
    const nome = this.modelo(modelo);
    const vetores: number[][] = [];
    for (let i = 0; i < textos.length; i += LOTE_EMBEDDINGS) {
      const lote = textos.slice(i, i + LOTE_EMBEDDINGS);
      const r = await this.chamar<{ embeddings?: { values?: number[] }[] }>(`models/${nome}:batchEmbedContents`, {
        requests: lote.map((t) => ({
          model: `models/${nome}`,
          content: { parts: [{ text: t }] },
          outputDimensionality: DIMENSOES_EMBEDDING,
        })),
      });
      // Abaixo da dimensão máxima o Gemini não normaliza os vetores.
      for (const e of r.embeddings ?? []) {
        const v = e.values ?? [];
        const norma = Math.hypot(...v) || 1;
        vetores.push(v.map((x) => x / norma));
      }
    }
    if (vetores.length !== textos.length) throw new Error("O Google Gemini devolveu menos embeddings que o pedido.");
    conferirDimensoes(vetores, modelo);
    return { vetores, tokens: estimarTokens(textos) };
  }

  async gerarJson<T>(p: PedidoJson<T>): Promise<RespostaJson<T>> {
    const r = await this.chamar<RespostaGemini>(`models/${this.modelo(p.modelo)}:generateContent`, {
      systemInstruction: { parts: [{ text: p.sistema }] },
      contents: [{ role: "user", parts: [{ text: p.usuario }] }],
      generationConfig: { responseMimeType: "application/json", responseJsonSchema: esquemaJson(p.esquema) },
    });
    const candidato = r.candidates?.[0];
    const texto = candidato?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
    if (!texto) {
      const motivo = candidato?.finishReason ?? r.promptFeedback?.blockReason ?? "sem motivo informado";
      throw new Error(`O Google Gemini não devolveu resposta (${motivo}).`);
    }
    const u = r.usageMetadata;
    return {
      dados: p.esquema.parse(extrairJson(texto)),
      tokensEntrada: u?.promptTokenCount ?? 0,
      tokensSaida: (u?.candidatesTokenCount ?? 0) + (u?.thoughtsTokenCount ?? 0),
    };
  }
}

/** Texto em um provedor e embeddings em outro (ex.: Claude + embeddings da OpenAI). */
class ProvedorComposto implements ProvedorIA {
  constructor(
    private texto: ProvedorIA,
    private vetores: ProvedorIA,
  ) {}

  get nome() {
    return this.texto.nome;
  }

  embeddings(textos: string[], modelo: string) {
    return this.vetores.embeddings(textos, modelo);
  }

  gerarJson<T>(pedido: PedidoJson<T>) {
    return this.texto.gerarJson(pedido);
  }
}

export function palavrasParaBusca(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4);
}

function hash(palavra: string) {
  let h = 2166136261;
  for (let i = 0; i < palavra.length; i++) h = Math.imul(h ^ palavra.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Determinístico: textos com palavras em comum ficam próximos (saco de palavras com hash). */
class ProvedorFalso implements ProvedorIA {
  readonly nome = "falso" as const;

  async embeddings(textos: string[]) {
    let tokens = 0;
    const vetores = textos.map((t) => {
      const v = new Array<number>(DIMENSOES_EMBEDDING).fill(0);
      const palavras = palavrasParaBusca(t);
      tokens += palavras.length;
      for (const p of palavras) {
        const h = hash(p);
        v[h % DIMENSOES_EMBEDDING] += h & 1 ? 1 : -1;
      }
      const norma = Math.hypot(...v);
      if (norma === 0) {
        v[0] = 1;
        return v;
      }
      return v.map((x) => x / norma);
    });
    return { vetores, tokens };
  }

  async gerarJson<T>(p: PedidoJson<T>): Promise<RespostaJson<T>> {
    const dados = p.esquema.parse(p.simular());
    return {
      dados,
      tokensEntrada: Math.ceil((p.sistema.length + p.usuario.length) / 4),
      tokensSaida: Math.ceil(JSON.stringify(dados).length / 4),
    };
  }
}

export function provedorFalsoAtivo() {
  return process.env.IA_PROVEDOR?.trim().toLowerCase() === "falso";
}

/** Cliente real de um provedor, ignorando IA_PROVEDOR=falso (usado também pelo teste de conexão). */
export function criarConexaoIA(c: ConexaoIA): ProvedorIA {
  if (c.provedor !== "OPENAI_COMPATIVEL" && !c.chave) {
    throw new Error(`Nenhuma chave da API configurada para ${INFO_PROVEDOR[c.provedor].rotulo}.`);
  }
  switch (c.provedor) {
    case "OPENAI":
      return new ProvedorOpenAI(c.chave, c.urlBase, false);
    case "OPENAI_COMPATIVEL":
      if (!c.urlBase) throw new Error("Informe a URL base do serviço compatível com a OpenAI.");
      return new ProvedorOpenAI(c.chave, c.urlBase, true);
    case "ANTHROPIC":
      return new ProvedorAnthropic(c.chave!, c.urlBase);
    case "GOOGLE":
      return new ProvedorGoogle(c.chave!, c.urlBase);
  }
}

/**
 * Provedor para as análises. Aceita a configuração completa (ver obterConfigIA) ou, por compatibilidade,
 * só a chave (OpenAI).
 */
export function criarProvedor(config: string | null | ConfigProvedor): ProvedorIA {
  if (provedorFalsoAtivo()) return new ProvedorFalso();
  const c: ConfigProvedor = config && typeof config === "object" ? config : { provedor: "OPENAI", chave: config, urlBase: null };
  const texto = criarConexaoIA(c);
  const e = c.embeddings;
  if (!e || (e.provedor === c.provedor && e.chave === c.chave && e.urlBase === c.urlBase)) return texto;
  return new ProvedorComposto(texto, criarConexaoIA(e));
}
