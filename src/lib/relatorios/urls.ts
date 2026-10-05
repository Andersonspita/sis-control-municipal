// Endereços dos PDFs (Route Handlers em src/app/(controle)/relatorios/pdf). Usado nas telas.

function comQuery(base: string, params: Record<string, string | number | null | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `${base}?${s}` : base;
}

export const PDF_RELATORIO = {
  autoavaliacao: (ciclo: string, unidade?: string) => comQuery("/relatorios/pdf/autoavaliacao", { ciclo, unidade }),
  demandas: (f: { inicio?: string; fim?: string; unidade?: string } = {}) => comQuery("/relatorios/pdf/demandas", f),
  medidas: (unidade?: string) => comQuery("/relatorios/pdf/medidas", { unidade }),
  auditoria: (id: string, versao?: "preliminar" | "final") => comQuery("/relatorios/pdf/auditoria", { id, versao }),
  anual: (ano: number) => comQuery("/relatorios/pdf/anual", { ano }),
  oficio: (demanda: string) => comQuery("/relatorios/pdf/oficio", { demanda }),
} as const;
