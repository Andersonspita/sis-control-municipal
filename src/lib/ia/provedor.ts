// Provedores de IA: OpenAI (SDK oficial) e um falso determinístico (IA_PROVEDOR=falso) para testes e dev sem chave.
import OpenAI from "openai";
import { z } from "zod";

/** Dimensão da coluna trechos_documento.embedding (vector(1536)). */
export const DIMENSOES_EMBEDDING = 1536;

export type PedidoJson<T> = {
  modelo: string;
  /** Nome do esquema enviado à OpenAI (letras, números e _). */
  nome: string;
  sistema: string;
  usuario: string;
  esquema: z.ZodType<T>;
  /** Resposta do provedor falso, calculada a partir da própria entrada. */
  simular: () => unknown;
};

export type RespostaJson<T> = { dados: T; tokensEntrada: number; tokensSaida: number };

export interface ProvedorIA {
  readonly nome: "openai" | "falso";
  embeddings(textos: string[], modelo: string): Promise<{ vetores: number[][]; tokens: number }>;
  gerarJson<T>(pedido: PedidoJson<T>): Promise<RespostaJson<T>>;
}

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

const LOTE_EMBEDDINGS = 96;

class ProvedorOpenAI implements ProvedorIA {
  readonly nome = "openai" as const;
  private cliente: OpenAI;

  constructor(chave: string) {
    this.cliente = new OpenAI({ apiKey: chave, timeout: 120_000, maxRetries: 2 });
  }

  async embeddings(textos: string[], modelo: string) {
    const vetores: number[][] = [];
    let tokens = 0;
    for (let i = 0; i < textos.length; i += LOTE_EMBEDDINGS) {
      const r = await this.cliente.embeddings.create({
        model: modelo,
        input: textos.slice(i, i + LOTE_EMBEDDINGS),
        ...(modelo.startsWith("text-embedding-3") ? { dimensions: DIMENSOES_EMBEDDING } : {}),
      });
      vetores.push(...[...r.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
      tokens += r.usage.prompt_tokens;
    }
    if (vetores.some((v) => v.length !== DIMENSOES_EMBEDDING)) {
      throw new Error(`O modelo de embeddings ${modelo} não devolveu vetores de ${DIMENSOES_EMBEDDING} dimensões.`);
    }
    return { vetores, tokens };
  }

  async gerarJson<T>(p: PedidoJson<T>): Promise<RespostaJson<T>> {
    const r = await this.cliente.responses.create({
      model: p.modelo,
      instructions: p.sistema,
      input: p.usuario,
      text: { format: { type: "json_schema", name: p.nome, schema: esquemaJson(p.esquema), strict: true } },
    });
    const dados = p.esquema.parse(JSON.parse(r.output_text));
    return { dados, tokensEntrada: r.usage?.input_tokens ?? 0, tokensSaida: r.usage?.output_tokens ?? 0 };
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

export function criarProvedor(chave: string | null): ProvedorIA {
  if (provedorFalsoAtivo()) return new ProvedorFalso();
  if (!chave) throw new Error("Nenhuma chave da OpenAI configurada.");
  return new ProvedorOpenAI(chave);
}
