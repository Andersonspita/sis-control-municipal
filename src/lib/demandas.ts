import type { StatusDemanda } from "@/generated/prisma/browser";
import { diasAte } from "@/lib/datas";

export const STATUS_FINAIS: StatusDemanda[] = ["CONCLUIDA", "CANCELADA"];
export const STATUS_ABERTOS: StatusDemanda[] = ["ENVIADA", "VISUALIZADA", "RESPONDIDA", "EM_ANALISE", "DEVOLVIDA"];
/** Situações em que a demanda aguarda providência da unidade destinatária. */
export const STATUS_AGUARDANDO_UNIDADE: StatusDemanda[] = ["ENVIADA", "VISUALIZADA", "DEVOLVIDA"];
/** Situações em que a resposta aguarda análise da controladoria. */
export const STATUS_AGUARDANDO_CONTROLE: StatusDemanda[] = ["RESPONDIDA", "EM_ANALISE"];

export function numeroDemanda(numero: number, ano: number) {
  return `${String(numero).padStart(3, "0")}/${ano}`;
}

export function encerrada(status: StatusDemanda) {
  return STATUS_FINAIS.includes(status);
}

/** "Vencida" não é gravada: prazo anterior a hoje e demanda nem concluída nem cancelada. */
export function estaVencida(d: { status: StatusDemanda; prazo: Date }) {
  return !encerrada(d.status) && diasAte(d.prazo) < 0;
}

export function descricaoPrazo(d: { status: StatusDemanda; prazo: Date }) {
  if (encerrada(d.status)) return null;
  const dias = diasAte(d.prazo);
  if (dias < 0) return { texto: `vencida há ${-dias} ${-dias === 1 ? "dia" : "dias"}`, tom: "perigo" as const };
  if (dias === 0) return { texto: "vence hoje", tom: "alerta" as const };
  if (dias === 1) return { texto: "vence amanhã", tom: "alerta" as const };
  return { texto: `${dias} dias restantes`, tom: dias <= 3 ? ("alerta" as const) : ("neutro" as const) };
}
