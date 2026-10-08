// Formatação dos valores das integrações (telas, painel e alertas).

export const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
export const percentual = (v: number) => `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
export const dataIso = (v: string | null) => (v ? v.slice(0, 10).split("-").reverse().join("/") : "—");
