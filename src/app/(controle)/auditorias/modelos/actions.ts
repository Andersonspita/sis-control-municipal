"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { criarModelosBase } from "@/lib/auditorias-modelos";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";

const esquemaModelo = z.object({
  modeloId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  nome: z.string().trim().min(3, { error: "Informe o nome do modelo (mínimo de 3 caracteres)." }).max(200),
  descricao: z.string().trim().max(2000).optional().transform((v) => v || null),
  tipo: z
    .union([z.enum(["CONFORMIDADE", "OPERACIONAL", "FINANCEIRA", "GESTAO", "ESPECIAL"]), z.literal("")])
    .optional()
    .transform((v) => v || null),
});

function nomeRepetido(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && err.code === "P2002";
}

export async function salvarModelo(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaModelo.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { modeloId, ...campos } = dados.data;

  let id: string;
  try {
    id = await comCliente(ctx, async (tx) => {
      if (modeloId) {
        const { count } = await tx.modeloChecklist.updateMany({ where: { id: modeloId }, data: campos });
        if (!count) throw new ErroNegocio("Modelo não encontrado.");
      }
      const modelo = modeloId
        ? { id: modeloId }
        : await tx.modeloChecklist.create({ data: { ...campos, clienteId: ctx.clienteId }, select: { id: true } });
      await registrarLog(tx, ctx.clienteId, {
        acao: modeloId ? "modelo_checklist.atualizado" : "modelo_checklist.criado",
        usuarioId: ctx.usuarioId,
        entidade: "ModeloChecklist",
        entidadeId: modelo.id,
        dados: { nome: campos.nome },
      });
      return modelo.id;
    });
  } catch (err) {
    return { erro: nomeRepetido(err) ? "Já existe um modelo com esse nome." : mensagemDeErro(err) };
  }
  revalidatePath("/auditorias/modelos");
  if (!modeloId) redirect(`/auditorias/modelos/${id}`);
  revalidatePath(`/auditorias/modelos/${id}`);
  return { ok: true, mensagem: "Modelo atualizado." };
}

export async function alternarModeloAtivo(modeloId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(modeloId).success) return { erro: "Modelo inválido." };
  let ativo = false;
  try {
    await comCliente(ctx, async (tx) => {
      const modelo = await tx.modeloChecklist.findUnique({ where: { id: modeloId }, select: { ativo: true, nome: true } });
      if (!modelo) throw new ErroNegocio("Modelo não encontrado.");
      ativo = !modelo.ativo;
      await tx.modeloChecklist.update({ where: { id: modeloId }, data: { ativo } });
      await registrarLog(tx, ctx.clienteId, {
        acao: ativo ? "modelo_checklist.ativado" : "modelo_checklist.desativado",
        usuarioId: ctx.usuarioId,
        entidade: "ModeloChecklist",
        entidadeId: modeloId,
        dados: { nome: modelo.nome },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/auditorias/modelos");
  revalidatePath(`/auditorias/modelos/${modeloId}`);
  return { ok: true, mensagem: ativo ? "Modelo ativado." : "Modelo desativado: não aparece mais para aplicação." };
}

const esquemaItem = z.object({
  modeloId: z.uuid(),
  itemId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  texto: z.string().trim().min(5, { error: "Escreva o item (mínimo de 5 caracteres)." }).max(2000),
  orientacao: z.string().trim().max(2000).optional().transform((v) => v || null),
});

/** Itens do modelo: alterações valem só para as próximas aplicações (as já aplicadas são cópias). */
export async function salvarItemModelo(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaItem.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { modeloId, itemId, ...campos } = dados.data;
  try {
    await comCliente(ctx, async (tx) => {
      if (!(await tx.modeloChecklist.count({ where: { id: modeloId } }))) throw new ErroNegocio("Modelo não encontrado.");
      if (itemId) {
        const { count } = await tx.itemChecklist.updateMany({ where: { id: itemId, modeloId }, data: campos });
        if (!count) throw new ErroNegocio("Item não encontrado.");
      } else {
        const ultimo = await tx.itemChecklist.aggregate({ where: { modeloId }, _max: { ordem: true } });
        await tx.itemChecklist.create({ data: { ...campos, modeloId, clienteId: ctx.clienteId, ordem: (ultimo._max.ordem ?? 0) + 1 } });
      }
      await registrarLog(tx, ctx.clienteId, {
        acao: itemId ? "modelo_checklist.item_atualizado" : "modelo_checklist.item_incluido",
        usuarioId: ctx.usuarioId,
        entidade: "ModeloChecklist",
        entidadeId: modeloId,
        dados: { texto: campos.texto.slice(0, 200) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath(`/auditorias/modelos/${modeloId}`);
  return { ok: true, mensagem: itemId ? "Item atualizado." : "Item incluído." };
}

export async function excluirItemModelo(modeloId: string, itemId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(modeloId).success || !z.uuid().safeParse(itemId).success) return { erro: "Item inválido." };
  try {
    await comCliente(ctx, async (tx) => {
      const item = await tx.itemChecklist.findFirst({ where: { id: itemId, modeloId }, select: { texto: true } });
      if (!item) throw new ErroNegocio("Item não encontrado.");
      await tx.itemChecklist.delete({ where: { id: itemId } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "modelo_checklist.item_excluido",
        usuarioId: ctx.usuarioId,
        entidade: "ModeloChecklist",
        entidadeId: modeloId,
        dados: { texto: item.texto.slice(0, 200) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath(`/auditorias/modelos/${modeloId}`);
  return { ok: true, mensagem: "Item excluído." };
}

export async function criarModelosBaseDoCliente(): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  let criados = 0;
  try {
    criados = await comCliente(ctx, async (tx) => {
      const n = await criarModelosBase(tx, ctx.clienteId);
      if (n) {
        await registrarLog(tx, ctx.clienteId, {
          acao: "modelo_checklist.base_criados",
          usuarioId: ctx.usuarioId,
          entidade: "ModeloChecklist",
          dados: { quantidade: n },
        });
      }
      return n;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/auditorias/modelos");
  return { ok: true, mensagem: criados ? `${criados} modelo(s)-base criado(s).` : "Os modelos-base já existem." };
}
