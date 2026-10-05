import type { StatusAuditoria } from "@/generated/prisma/browser";

/**
 * Ciclo da auditoria: avança uma etapa por vez, pode voltar uma etapa antes do relatório final
 * e pode ser cancelada enquanto não estiver encerrada. Espelha auditoria_transicao_valida() no banco.
 */
export const TRANSICOES_AUDITORIA: Record<StatusAuditoria, readonly StatusAuditoria[]> = {
  PLANEJAMENTO: ["EXECUCAO", "CANCELADA"],
  EXECUCAO: ["RELATORIO_PRELIMINAR", "PLANEJAMENTO", "CANCELADA"],
  RELATORIO_PRELIMINAR: ["MANIFESTACAO", "EXECUCAO", "CANCELADA"],
  MANIFESTACAO: ["RELATORIO_FINAL", "RELATORIO_PRELIMINAR", "CANCELADA"],
  RELATORIO_FINAL: ["MONITORAMENTO", "ENCERRADA", "CANCELADA"],
  MONITORAMENTO: ["ENCERRADA", "CANCELADA"],
  ENCERRADA: [],
  CANCELADA: [],
};

export const ETAPAS_AUDITORIA: readonly StatusAuditoria[] = [
  "PLANEJAMENTO",
  "EXECUCAO",
  "RELATORIO_PRELIMINAR",
  "MANIFESTACAO",
  "RELATORIO_FINAL",
  "MONITORAMENTO",
  "ENCERRADA",
];

export const STATUS_AUDITORIA_FINAIS: readonly StatusAuditoria[] = ["ENCERRADA", "CANCELADA"];

/** Etapas em que o planejamento (dados, equipe, matriz) ainda pode ser alterado. */
export const STATUS_EDITA_PLANEJAMENTO: readonly StatusAuditoria[] = ["PLANEJAMENTO", "EXECUCAO"];
/** Etapas em que modelos de checklist podem ser aplicados. */
export const STATUS_APLICA_CHECKLIST: readonly StatusAuditoria[] = ["PLANEJAMENTO", "EXECUCAO"];
/** Etapas em que os itens de checklist recebem resultado. */
export const STATUS_AVALIA_CHECKLIST: readonly StatusAuditoria[] = ["EXECUCAO"];
/** Etapas em que achados e recomendações podem ser registrados ou ajustados. */
export const STATUS_EDITA_ACHADOS: readonly StatusAuditoria[] = ["EXECUCAO", "RELATORIO_PRELIMINAR", "MANIFESTACAO"];
/** Etapas em que recomendações podem virar ações no plano da auditoria. */
export const STATUS_GERA_ACAO: readonly StatusAuditoria[] = [
  "EXECUCAO",
  "RELATORIO_PRELIMINAR",
  "MANIFESTACAO",
  "RELATORIO_FINAL",
  "MONITORAMENTO",
];
/** Etapas em que a auditoria pode enviar solicitações (demandas) às unidades. */
export const STATUS_SOLICITA: readonly StatusAuditoria[] = ["PLANEJAMENTO", "EXECUCAO", "MANIFESTACAO"];

export function transicaoPermitida(de: StatusAuditoria, para: StatusAuditoria) {
  return TRANSICOES_AUDITORIA[de].includes(para);
}

export function numeroAuditoria(numero: number, ano: number) {
  return `${String(numero).padStart(3, "0")}/${ano}`;
}

export const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

export function periodoPrevisto(mesInicio: number, mesFim: number) {
  return mesInicio === mesFim ? MESES[mesInicio - 1] : `${MESES[mesInicio - 1]}–${MESES[mesFim - 1]}`;
}

/** Ordena do maior para o menor risco (probabilidade × impacto); empate pelo impacto e depois pelo início. */
export function ordenarPorRisco<T extends { probabilidade: number; impacto: number; mesInicio?: number }>(itens: T[]) {
  return [...itens].sort(
    (a, b) =>
      b.probabilidade * b.impacto - a.probabilidade * a.impacto ||
      b.impacto - a.impacto ||
      (a.mesInicio ?? 0) - (b.mesInicio ?? 0),
  );
}
