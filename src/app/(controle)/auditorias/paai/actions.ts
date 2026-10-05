"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, type Tx } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { inserirAuditoria } from "@/lib/dados/auditorias";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import { classificarRisco } from "@/lib/risco";
import { numeroAuditoria } from "@/lib/auditorias";
import type { EstadoAcao } from "@/lib/acoes";

const escala = (rotulo: string) =>
  z.coerce
    .number({ error: `Informe ${rotulo} de 1 a 5.` })
    .int({ error: `Informe ${rotulo} de 1 a 5.` })
    .min(1, { error: `Informe ${rotulo} de 1 a 5.` })
    .max(5, { error: `Informe ${rotulo} de 1 a 5.` });
const mes = z.coerce.number({ error: "Mês inválido." }).int().min(1, { error: "Mês inválido." }).max(12, { error: "Mês inválido." });
const anoValido = z.coerce.number().int().min(2000).max(2100);

function revalidarPaai() {
  revalidatePath("/auditorias/paai");
}

async function travarPlano(tx: Tx, planoId: string) {
  await tx.$queryRaw`SELECT id FROM planos_anuais_auditoria WHERE id = ${planoId}::uuid FOR UPDATE`;
  const plano = await tx.planoAnualAuditoria.findUnique({ where: { id: planoId }, select: { id: true, ano: true, status: true } });
  if (!plano) throw new ErroNegocio("Plano anual não encontrado.");
  return plano;
}

export async function criarPaai(ano: number): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const a = anoValido.safeParse(ano);
  if (!a.success) return { erro: "Ano inválido." };
  try {
    await comCliente(ctx, async (tx) => {
      const existente = await tx.planoAnualAuditoria.findUnique({ where: { clienteId_ano: { clienteId: ctx.clienteId, ano: a.data } } });
      if (existente) return;
      const plano = await tx.planoAnualAuditoria.create({
        data: { clienteId: ctx.clienteId, ano: a.data, criadoPorId: ctx.usuarioId },
        select: { id: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "paai.criado",
        usuarioId: ctx.usuarioId,
        entidade: "PlanoAnualAuditoria",
        entidadeId: plano.id,
        dados: { ano: a.data },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarPaai();
  return { ok: true, mensagem: `PAAI ${a.data} criado.` };
}

const esquemaItem = z
  .object({
    planoId: z.uuid(),
    itemId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
    titulo: z.string().trim().min(5, { error: "Informe o título (mínimo de 5 caracteres)." }).max(200),
    tipo: z.enum(["CONFORMIDADE", "OPERACIONAL", "FINANCEIRA", "GESTAO", "ESPECIAL"], { error: "Selecione o tipo." }),
    unidadeId: z.union([z.uuid({ error: "Unidade inválida." }), z.literal("")]).optional().transform((v) => v || null),
    objetivo: z.string().trim().max(5000).optional().transform((v) => v || null),
    probabilidade: escala("a probabilidade"),
    impacto: escala("o impacto"),
    mesInicio: mes,
    mesFim: mes,
  })
  .refine((d) => d.mesFim >= d.mesInicio, { error: "O mês final não pode ser anterior ao inicial." });

export async function salvarItemPaai(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaItem.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { planoId, itemId, ...campos } = dados.data;

  try {
    await comCliente(ctx, async (tx) => {
      const plano = await travarPlano(tx, planoId);
      if (plano.status !== "RASCUNHO") throw new ErroNegocio("PAAI aprovado: volte-o para rascunho para alterar.");
      if (campos.unidadeId && !(await tx.unidade.count({ where: { id: campos.unidadeId } }))) {
        throw new ErroNegocio("Unidade não encontrada.");
      }
      if (itemId) {
        const { count } = await tx.itemPlanoAuditoria.updateMany({ where: { id: itemId, planoId }, data: campos });
        if (!count) throw new ErroNegocio("Auditoria prevista não encontrada.");
      } else {
        await tx.itemPlanoAuditoria.create({ data: { ...campos, planoId, clienteId: ctx.clienteId } });
      }
      await registrarLog(tx, ctx.clienteId, {
        acao: itemId ? "paai.item_atualizado" : "paai.item_incluido",
        usuarioId: ctx.usuarioId,
        entidade: "PlanoAnualAuditoria",
        entidadeId: planoId,
        dados: { titulo: campos.titulo, tipo: campos.tipo, risco: classificarRisco(campos.probabilidade, campos.impacto) },
      });
      return plano.ano;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarPaai();
  return { ok: true, mensagem: itemId ? "Auditoria prevista atualizada." : "Auditoria incluída no PAAI." };
}

export async function excluirItemPaai(itemId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(itemId).success) return { erro: "Item inválido." };
  try {
    await comCliente(ctx, async (tx) => {
      const item = await tx.itemPlanoAuditoria.findUnique({
        where: { id: itemId },
        select: { planoId: true, titulo: true, auditoria: { select: { id: true } } },
      });
      if (!item) throw new ErroNegocio("Auditoria prevista não encontrada.");
      const plano = await travarPlano(tx, item.planoId);
      if (plano.status !== "RASCUNHO") throw new ErroNegocio("PAAI aprovado: volte-o para rascunho para alterar.");
      if (item.auditoria) throw new ErroNegocio("A auditoria prevista já foi iniciada e não pode ser excluída.");
      await tx.itemPlanoAuditoria.delete({ where: { id: itemId } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "paai.item_excluido",
        usuarioId: ctx.usuarioId,
        entidade: "PlanoAnualAuditoria",
        entidadeId: item.planoId,
        dados: { titulo: item.titulo },
      });
      return plano.ano;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarPaai();
  return { ok: true, mensagem: "Auditoria prevista excluída." };
}

export async function alterarStatusPaai(planoId: string, status: "RASCUNHO" | "APROVADO"): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(planoId).success || !["RASCUNHO", "APROVADO"].includes(status)) return { erro: "Dados inválidos." };
  if (ctx.perfil !== "CONTROLADOR") return { erro: "Somente o controlador aprova ou reabre o PAAI." };
  try {
    await comCliente(ctx, async (tx) => {
      const plano = await travarPlano(tx, planoId);
      if (plano.status === status) throw new ErroNegocio("O PAAI já está nessa situação.");
      if (status === "APROVADO" && !(await tx.itemPlanoAuditoria.count({ where: { planoId } }))) {
        throw new ErroNegocio("Inclua ao menos uma auditoria antes de aprovar o PAAI.");
      }
      await tx.planoAnualAuditoria.update({
        where: { id: planoId },
        data:
          status === "APROVADO"
            ? { status, aprovadoPorId: ctx.usuarioId, aprovadoEm: new Date() }
            : { status, aprovadoPorId: null, aprovadoEm: null },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: status === "APROVADO" ? "paai.aprovado" : "paai.reaberto",
        usuarioId: ctx.usuarioId,
        entidade: "PlanoAnualAuditoria",
        entidadeId: planoId,
        dados: { ano: plano.ano, de: plano.status, para: status },
      });
      return plano.ano;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarPaai();
  return { ok: true, mensagem: status === "APROVADO" ? "PAAI aprovado." : "PAAI voltou para rascunho." };
}

/** Inicia a auditoria prevista no PAAI aprovado (fica em planejamento, com os dados do item). */
export async function iniciarAuditoriaDoItem(itemId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(itemId).success) return { erro: "Item inválido." };
  let id: string;
  try {
    id = await comCliente(ctx, async (tx) => {
      const item = await tx.itemPlanoAuditoria.findUnique({
        where: { id: itemId },
        select: { planoId: true, titulo: true, tipo: true, unidadeId: true, objetivo: true, auditoria: { select: { id: true } } },
      });
      if (!item) throw new ErroNegocio("Auditoria prevista não encontrada.");
      const plano = await travarPlano(tx, item.planoId);
      const jaIniciada = await tx.auditoria.findUnique({ where: { itemPlanoId: itemId }, select: { id: true } });
      if (jaIniciada) return jaIniciada.id;
      if (plano.status !== "APROVADO") throw new ErroNegocio("Aprove o PAAI antes de iniciar as auditorias previstas.");
      const a = await inserirAuditoria(tx, ctx, {
        titulo: item.titulo,
        tipo: item.tipo,
        unidadeId: item.unidadeId,
        objetivo: item.objetivo && item.objetivo.length >= 10 ? item.objetivo : `Auditoria prevista no PAAI ${plano.ano}: ${item.titulo}.`,
        itemPlanoId: itemId,
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "auditoria.criada",
        usuarioId: ctx.usuarioId,
        entidade: "Auditoria",
        entidadeId: a.id,
        dados: { numero: numeroAuditoria(a.numero, a.ano), titulo: item.titulo, tipo: item.tipo, paai: plano.ano },
      });
      return a.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/auditorias");
  revalidatePath("/auditorias/paai");
  redirect(`/auditorias/${id}`);
}
