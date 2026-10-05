// Regras das ações 5W2H. Funções puras, usadas no servidor e no navegador.

import type { StatusAcao } from "@/generated/prisma/browser";

/** Ações que ainda contam como abertas (nem concluídas nem canceladas). */
export const STATUS_ABERTOS: StatusAcao[] = ["PENDENTE", "EM_ANDAMENTO", "AGUARDANDO_VALIDACAO"];

/** Status que a edição comum pode atribuir; CONCLUIDA só por validação do controlador. */
export const STATUS_EDITAVEIS: StatusAcao[] = ["PENDENTE", "EM_ANDAMENTO", "AGUARDANDO_VALIDACAO", "CANCELADA"];

/** Data no formato AAAA-MM-DD (campos @db.Date chegam como meia-noite UTC). */
export function dataIso(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Vencida = prazo anterior a hoje e ação não concluída/cancelada. `hoje` em AAAA-MM-DD. */
export function acaoVencida(acao: { status: StatusAcao; prazo: Date | string | null }, hoje: string) {
  if (!acao.prazo || !STATUS_ABERTOS.includes(acao.status)) return false;
  const prazo = typeof acao.prazo === "string" ? acao.prazo.slice(0, 10) : dataIso(acao.prazo);
  return prazo < hoje;
}

/** Execução do plano: média do percentual das ações não canceladas (concluída = 100). */
export function percentualExecutado(acoes: readonly { status: StatusAcao; percentual: number }[]): number | null {
  const validas = acoes.filter((a) => a.status !== "CANCELADA");
  if (!validas.length) return null;
  const soma = validas.reduce((s, a) => s + (a.status === "CONCLUIDA" ? 100 : Math.min(100, Math.max(0, a.percentual))), 0);
  return Math.round(soma / validas.length);
}

/** Converte valor monetário digitado em pt-BR ("1.234,56", "R$ 300") para número; null se vazio/inválido. */
export function lerValorMonetario(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/[R$\s]/g, "");
  if (!limpo) return null;
  const soMilhar = /^\d{1,3}(\.\d{3})+$/.test(limpo);
  const normalizado = limpo.includes(",") || soMilhar ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function formatarMoeda(valor: number | string | null | undefined) {
  if (valor === null || valor === undefined || valor === "") return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
