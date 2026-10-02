import "server-only";
import { headers } from "next/headers";
import { db, type Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

type EntradaLog = {
  acao: string;
  usuarioId?: string | null;
  entidade?: string;
  entidadeId?: string;
  dados?: Prisma.InputJsonValue;
};

async function ipRequisicao() {
  try {
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  } catch {
    return null;
  }
}

// createMany em vez de create: o INSERT ... RETURNING do create exige que a linha passe na política
// de leitura, que bloqueia logs sem cliente e leitura por satélite.

/** Registro dentro de `comCliente`: o cliente_id vem do contexto da transação. */
export async function registrarLog(tx: Tx, clienteId: string, entrada: EntradaLog) {
  await tx.logAuditoria.createMany({
    data: [{ ...entrada, clienteId, ip: await ipRequisicao() }],
  });
}

/** Eventos sem cliente (login, falhas de autenticação, administração HorizonAJ). */
export async function registrarLogGlobal(entrada: EntradaLog) {
  await db.logAuditoria.createMany({ data: [{ ...entrada, ip: await ipRequisicao() }] });
}
