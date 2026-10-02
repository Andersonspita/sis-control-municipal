"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";

const esquema = z.object({
  nome: z.string().trim().min(3, { error: "Informe o nome da unidade." }).max(160),
  sigla: z.string().trim().max(20).optional().transform((v) => v?.toUpperCase() || undefined),
  tipo: z.enum(["ORGAO", "SECRETARIA", "DEPARTAMENTO", "DIVISAO", "SETOR", "OUTRO"]),
  paiId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || undefined),
  responsavelNome: z.string().trim().max(160).optional().transform((v) => v || undefined),
  responsavelEmail: z
    .union([z.email({ error: "E-mail do responsável inválido." }), z.literal("")])
    .optional()
    .transform((v) => v || undefined),
});

export type EstadoUnidade = { erro?: string; ok?: boolean } | undefined;

export async function criarUnidade(_: EstadoUnidade, formData: FormData): Promise<EstadoUnidade> {
  const ctx = await exigirContexto(["CONTROLADOR"]);
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  await comCliente(ctx, async (tx) => {
    if (dados.data.paiId) {
      const pai = await tx.unidade.findUnique({ where: { id: dados.data.paiId }, select: { id: true } });
      if (!pai) throw new Error("Unidade superior não encontrada");
    }
    const unidade = await tx.unidade.create({ data: { ...dados.data, clienteId: ctx.clienteId } });
    await registrarLog(tx, ctx.clienteId, {
      acao: "unidade.criada",
      usuarioId: ctx.usuarioId,
      entidade: "Unidade",
      entidadeId: unidade.id,
      dados: { nome: unidade.nome, sigla: unidade.sigla },
    });
  });

  revalidatePath("/unidades");
  return { ok: true };
}
