"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { IDS_TEMAS } from "@/lib/temas";

const esquema = z.object({ tema: z.enum(IDS_TEMAS, { error: "Escolha um dos temas disponíveis." }) });

export type EstadoTema = { erro?: string; ok?: boolean } | undefined;

export async function definirTema(_: EstadoTema, formData: FormData): Promise<EstadoTema> {
  const ctx = await exigirContexto(["CONTROLADOR"]);
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  const anterior = ctx.cliente.tema;
  if (anterior === dados.data.tema) return { ok: true };

  await comCliente(ctx, async (tx) => {
    await tx.cliente.update({ where: { id: ctx.clienteId }, data: { tema: dados.data.tema } });
    await registrarLog(tx, ctx.clienteId, {
      acao: "cliente.tema_alterado",
      usuarioId: ctx.usuarioId,
      entidade: "Cliente",
      entidadeId: ctx.clienteId,
      dados: { de: anterior, para: dados.data.tema },
    });
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
