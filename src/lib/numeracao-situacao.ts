import type { Prisma } from "../generated/prisma/client";

// Sem "server-only": usado pela tela de Alertas e pela criação automática na coleta (também no cron).

/** Ano corrente no fuso da Bahia (a numeração dos alertas é anual). */
export function anoDaNumeracao(agora = new Date()) {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric" }).format(agora));
}

/**
 * Próximo número sequencial de situação do cliente no ano. Trava a numeração até o fim da transação,
 * então duas criações simultâneas (tela e coleta automática) não recebem o mesmo número.
 */
export async function proximoNumeroSituacao(tx: Prisma.TransactionClient, clienteId: string, ano: number) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`situacao:${clienteId}:${ano}`}, 0))`;
  const ultima = await tx.situacao.aggregate({ where: { clienteId, ano }, _max: { numero: true } });
  return (ultima._max.numero ?? 0) + 1;
}
