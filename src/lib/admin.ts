import "server-only";
import { redirect } from "next/navigation";
import { exigirUsuario } from "@/lib/auth/dal";
import { comCliente, db, type ContextoCliente, type Tx } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";

export function violouUnicidade(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

/** Exige sessão de administrador global HorizonAJ. */
export async function exigirAdmin() {
  const sessao = await exigirUsuario();
  if (!sessao.usuario.adminHorizon) redirect("/");
  return sessao;
}

/**
 * Transação no contexto de administração (sem cliente), usada para ler a trilha global.
 * O banco confere por conta própria se o usuário é administrador ativo (ver app_eh_admin).
 */
export async function comAdmin<T>(usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.cliente_id', '', true),
      set_config('app.usuario_id', ${usuarioId}, true),
      set_config('app.perfil', 'ADMIN_HORIZON', true)`;
    return fn(tx);
  });
}

/**
 * Acesso às tabelas de um cliente pelo administrador (ex.: unidades para o escopo do satélite).
 * Usa o perfil de controlador apenas para as políticas de RLS; não há vínculo real.
 */
export function comClienteComoAdmin<T>(adminId: string, clienteId: string, fn: (tx: Tx) => Promise<T>) {
  const ctx: ContextoCliente = { clienteId, usuarioId: adminId, perfil: "CONTROLADOR" };
  return comCliente(ctx, fn);
}

/** Unidades ativas do cliente em ordem hierárquica, com a profundidade para recuo. */
export async function unidadesEmArvore(tx: Tx) {
  const unidades = await tx.unidade.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, sigla: true, paiId: true },
    orderBy: { nome: "asc" },
  });
  const ids = new Set(unidades.map((u) => u.id));
  const filhas = new Map<string | null, typeof unidades>();
  for (const u of unidades) {
    const pai = u.paiId && ids.has(u.paiId) ? u.paiId : null;
    filhas.set(pai, [...(filhas.get(pai) ?? []), u]);
  }
  const saida: { id: string; nome: string; sigla: string | null; nivel: number }[] = [];
  const visitar = (pai: string | null, nivel: number) => {
    for (const u of filhas.get(pai) ?? []) {
      saida.push({ id: u.id, nome: u.nome, sigla: u.sigla, nivel });
      visitar(u.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return saida;
}
