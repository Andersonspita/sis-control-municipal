export const CLASSE_SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export type Parametros = Record<string, string | string[] | undefined>;

export function texto(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function numeroPagina(v: string | string[] | undefined) {
  const n = Number.parseInt(texto(v), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}