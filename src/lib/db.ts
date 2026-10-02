import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma, type Perfil } from "@/generated/prisma/client";

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

function criarCliente() {
  const connectionString = process.env.APP_DATABASE_URL;
  if (!connectionString) throw new Error("APP_DATABASE_URL não definida");
  // O adapter grava e lê datas como UTC sem fuso; a sessão precisa estar em UTC.
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, options: "-c TimeZone=UTC" }) });
}

/**
 * Conexão com o papel da aplicação (sujeito a RLS).
 * Uso direto apenas para tabelas globais: usuarios, sessoes, clientes, vinculos_cliente, normas, requisitos.
 * Tabelas por cliente devem ser acessadas via `comCliente`.
 */
export const db = globalParaPrisma.prisma ?? criarCliente();
if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = db;

export type Tx = Prisma.TransactionClient;

export type ContextoCliente = {
  clienteId: string;
  usuarioId: string;
  perfil: Perfil;
};

/** Executa `fn` numa transação com o contexto de cliente aplicado às políticas de RLS. */
export async function comCliente<T>(
  ctx: ContextoCliente,
  fn: (tx: Tx) => Promise<T>,
  opcoes?: { timeout?: number },
): Promise<T> {
  return db.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.cliente_id', ${ctx.clienteId}, true),
        set_config('app.usuario_id', ${ctx.usuarioId}, true),
        set_config('app.perfil', ${ctx.perfil}, true)`;
      return fn(tx);
    },
    { timeout: opcoes?.timeout ?? 15_000 },
  );
}
