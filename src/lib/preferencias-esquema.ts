import { z } from "zod";

// Preferências de exibição gravadas em usuarios.preferencias (JSONB), por usuário.
// Compartilhado entre servidor e componentes cliente: sem dependências de servidor.

/** Páginas que guardam o estado dos blocos recolhidos. */
export const PAGINAS_PREFERENCIA = ["painel", "dados-externos", "alertas"] as const;
export type PaginaPreferencia = (typeof PAGINAS_PREFERENCIA)[number];

const idBloco = z.string().regex(/^[a-z0-9-]{1,40}$/);
const listaIds = z.array(idBloco).max(50);

const esquemaPagina = z.object({
  /** Blocos recolhidos (só o título fica visível). */
  recolhidos: listaIds.optional(),
  /** Blocos que o usuário escolheu não exibir (usado no painel inicial). */
  ocultos: listaIds.optional(),
});

export type PreferenciaPagina = z.infer<typeof esquemaPagina>;
export type Preferencias = Partial<Record<PaginaPreferencia, PreferenciaPagina>>;

export const esquemaListaIds = listaIds;

export function paginaValida(valor: unknown): valor is PaginaPreferencia {
  return typeof valor === "string" && (PAGINAS_PREFERENCIA as readonly string[]).includes(valor);
}

/** Lê o JSON gravado, descartando o que não for reconhecido (nunca lança). */
export function lerPreferencias(valor: unknown): Preferencias {
  const saida: Preferencias = {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return saida;
  for (const pagina of PAGINAS_PREFERENCIA) {
    const r = esquemaPagina.safeParse((valor as Record<string, unknown>)[pagina]);
    if (r.success) saida[pagina] = r.data;
  }
  return saida;
}
