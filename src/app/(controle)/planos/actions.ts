"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { lerValorMonetario } from "@/lib/dados/acoes";

const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);

function revalidarPlano(planoId: string) {
  revalidatePath(`/planos/${planoId}`);
  revalidatePath("/planos");
  revalidatePath("/painel");
}

// ───────────── Plano ─────────────

const esquemaPlano = z.object({
  titulo: z.string().trim().min(3, { error: "Informe o título do plano." }).max(200),
  descricao: textoOpcional(2000),
  origem: z.enum(["OUTRA", "DETERMINACAO_TC"], { error: "Origem inválida." }),
});

export type EstadoForm = { erro?: string; ok?: boolean; mensagem?: string } | undefined;

export async function criarPlano(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaPlano.safeParse({
    titulo: formData.get("titulo"),
    descricao: formData.get("descricao") ?? undefined,
    origem: formData.get("origem"),
  });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  const plano = await comCliente(ctx, async (tx) => {
    const p = await tx.planoAcao.create({
      data: { ...dados.data, clienteId: ctx.clienteId, status: "EM_EXECUCAO", criadoPorId: ctx.usuarioId },
      select: { id: true },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "plano.criado",
      usuarioId: ctx.usuarioId,
      entidade: "PlanoAcao",
      entidadeId: p.id,
      dados: { titulo: dados.data.titulo, origem: dados.data.origem },
    });
    return p;
  });
  revalidatePath("/planos");
  redirect(`/planos/${plano.id}`);
}

export type Resultado = { ok: true } | { ok: false; erro: string };

const esquemaStatusPlano = z.object({
  planoId: z.uuid(),
  status: z.enum(["RASCUNHO", "EM_EXECUCAO", "CONCLUIDO", "CANCELADO"]),
});

export async function alterarStatusPlano(entrada: z.input<typeof esquemaStatusPlano>): Promise<Resultado> {
  const ctx = await exigirContexto(["CONTROLADOR"]);
  const dados = esquemaStatusPlano.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Dados inválidos." };
  const { planoId, status } = dados.data;

  const r = await comCliente(ctx, async (tx) => {
    const plano = await tx.planoAcao.findUnique({ where: { id: planoId }, select: { status: true } });
    if (!plano) return { ok: false as const, erro: "Plano não encontrado." };
    if (plano.status === status) return { ok: true as const };
    await tx.planoAcao.update({ where: { id: planoId }, data: { status } });
    await registrarLog(tx, ctx.clienteId, {
      acao: "plano.status_alterado",
      usuarioId: ctx.usuarioId,
      entidade: "PlanoAcao",
      entidadeId: planoId,
      dados: { de: plano.status, para: status },
    });
    return { ok: true as const };
  });
  if (r.ok) revalidarPlano(planoId);
  return r;
}

// ───────────── Ação (5W2H) ─────────────

const esquemaAcao = z.object({
  id: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  planoId: z.uuid(),
  oQue: z.string().trim().min(3, { error: "Descreva o que será feito." }).max(1000),
  porQue: textoOpcional(2000),
  onde: textoOpcional(300),
  responsavel: textoOpcional(200),
  unidadeResponsavelId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  prazo: z.union([z.iso.date({ error: "Prazo inválido." }), z.literal("")]).optional().transform((v) => v || null),
  como: textoOpcional(2000),
  custo: z.string().trim().max(30).optional(),
  // CONCLUIDA fica de fora: só a validação do controlador conclui uma ação.
  status: z.enum(["PENDENTE", "EM_ANDAMENTO", "AGUARDANDO_VALIDACAO", "CANCELADA"], { error: "Status inválido." }).optional(),
  prioridade: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]),
  percentual: z.preprocess(
    (v) => (v === undefined || v === "" ? undefined : v),
    z.coerce.number({ error: "Percentual entre 0 e 100." }).int().min(0, { error: "Percentual entre 0 e 100." }).max(100, { error: "Percentual entre 0 e 100." }).optional(),
  ),
});

export async function salvarAcao(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaAcao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { id, planoId, custo, ...campos } = dados.data;

  const custoEstimado = lerValorMonetario(custo);
  if (custo && custoEstimado === null) return { erro: "Custo estimado inválido. Use, por exemplo, 1.500,00." };

  const r = await comCliente<EstadoForm>(ctx, async (tx) => {
    const plano = await tx.planoAcao.findUnique({ where: { id: planoId }, select: { status: true } });
    if (!plano) return { erro: "Plano não encontrado." };
    if (campos.unidadeResponsavelId) {
      const unidade = await tx.unidade.findUnique({ where: { id: campos.unidadeResponsavelId }, select: { id: true } });
      if (!unidade) return { erro: "Unidade responsável não encontrada." };
    }
    const prazo = campos.prazo ? new Date(campos.prazo) : null;

    if (!id) {
      if (plano.status === "CANCELADO" || plano.status === "CONCLUIDO") {
        return { erro: "Não é possível adicionar ações a um plano encerrado." };
      }
      const status = campos.status ?? "PENDENTE";
      const percentual = status === "AGUARDANDO_VALIDACAO" ? 100 : (campos.percentual ?? 0);
      const acao = await tx.acao.create({
        data: { ...campos, status, prazo, percentual, custoEstimado, planoId, clienteId: ctx.clienteId },
        select: { id: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "acao.criada",
        usuarioId: ctx.usuarioId,
        entidade: "Acao",
        entidadeId: acao.id,
        dados: { planoId, oQue: campos.oQue, status },
      });
      return { ok: true };
    }

    const atual = await tx.acao.findUnique({ where: { id }, select: { planoId: true, status: true, percentual: true } });
    if (!atual || atual.planoId !== planoId) return { erro: "Ação não encontrada." };
    // Concluída só muda por nova validação; a edição comum não altera status nem percentual.
    const concluida = atual.status === "CONCLUIDA";
    const status = concluida ? atual.status : (campos.status ?? atual.status);
    const percentual =
      concluida || status === "AGUARDANDO_VALIDACAO" ? 100 : (campos.percentual ?? atual.percentual);
    await tx.acao.update({
      where: { id },
      data: { ...campos, status, percentual, prazo, custoEstimado },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "acao.atualizada",
      usuarioId: ctx.usuarioId,
      entidade: "Acao",
      entidadeId: id,
      dados: { planoId, status: { de: atual.status, para: status }, percentual: { de: atual.percentual, para: percentual } },
    });
    return { ok: true };
  });
  if (r?.ok) revalidarPlano(planoId);
  return r;
}

const esquemaValidacao = z.object({
  acaoId: z.uuid(),
  decisao: z.enum(["aprovar", "devolver"]),
  parecer: textoOpcional(2000),
});

export async function validarAcao(_: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const ctx = await exigirContexto(["CONTROLADOR"]);
  const dados = esquemaValidacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Dados inválidos." };
  const { acaoId, decisao, parecer } = dados.data;
  if (decisao === "devolver" && !parecer) return { erro: "Informe no parecer o que falta para concluir a ação." };

  const r = await comCliente<{ erro?: string; ok?: boolean; planoId?: string }>(ctx, async (tx) => {
    const acao = await tx.acao.findUnique({ where: { id: acaoId }, select: { planoId: true, status: true } });
    if (!acao) return { erro: "Ação não encontrada." };
    if (decisao === "devolver" && acao.status !== "AGUARDANDO_VALIDACAO") {
      return { erro: "Só é possível devolver ações que aguardam validação." };
    }
    if (decisao === "aprovar" && !["PENDENTE", "EM_ANDAMENTO", "AGUARDANDO_VALIDACAO"].includes(acao.status)) {
      return { erro: "Esta ação não está aberta para validação." };
    }
    await tx.acao.update({
      where: { id: acaoId },
      data:
        decisao === "aprovar"
          ? { status: "CONCLUIDA", percentual: 100, validadoPorId: ctx.usuarioId, validadoEm: new Date(), parecerValidacao: parecer }
          : { status: "EM_ANDAMENTO", validadoPorId: null, validadoEm: null, parecerValidacao: parecer },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: decisao === "aprovar" ? "acao.validada" : "acao.devolvida",
      usuarioId: ctx.usuarioId,
      entidade: "Acao",
      entidadeId: acaoId,
      dados: { planoId: acao.planoId, de: acao.status, parecer },
    });
    return { ok: true, planoId: acao.planoId };
  });
  if (r.planoId) revalidarPlano(r.planoId);
  if (!r.ok) return { erro: r.erro };
  return { ok: true, mensagem: decisao === "aprovar" ? "Conclusão validada." : "Ação devolvida para ajustes." };
}

// ───────────── Marcos ─────────────

const esquemaMarco = z.object({
  acaoId: z.uuid(),
  descricao: z.string().trim().min(2, { error: "Descreva o marco." }).max(300),
  prazo: z.union([z.iso.date({ error: "Data inválida." }), z.literal("")]).optional().transform((v) => v || null),
});

export async function criarMarco(entrada: z.input<typeof esquemaMarco>): Promise<Resultado> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaMarco.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const { acaoId, descricao, prazo } = dados.data;

  const r = await comCliente(ctx, async (tx) => {
    const acao = await tx.acao.findUnique({ where: { id: acaoId }, select: { planoId: true, _count: { select: { marcos: true } } } });
    if (!acao) return { ok: false as const, erro: "Ação não encontrada." };
    const marco = await tx.marcoAcao.create({
      data: { clienteId: ctx.clienteId, acaoId, descricao, prazo: prazo ? new Date(prazo) : null, ordem: acao._count.marcos },
      select: { id: true },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "marco.criado",
      usuarioId: ctx.usuarioId,
      entidade: "MarcoAcao",
      entidadeId: marco.id,
      dados: { acaoId, descricao },
    });
    return { ok: true as const, planoId: acao.planoId };
  });
  if (!r.ok) return r;
  revalidarPlano(r.planoId);
  return { ok: true };
}

const esquemaAlternar = z.object({ marcoId: z.uuid(), concluido: z.boolean() });

export async function alternarMarco(entrada: z.input<typeof esquemaAlternar>): Promise<Resultado> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaAlternar.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Dados inválidos." };
  const { marcoId, concluido } = dados.data;

  const r = await comCliente(ctx, async (tx) => {
    const marco = await tx.marcoAcao.findUnique({ where: { id: marcoId }, select: { acao: { select: { planoId: true } } } });
    if (!marco) return { ok: false as const, erro: "Marco não encontrado." };
    await tx.marcoAcao.update({ where: { id: marcoId }, data: { concluidoEm: concluido ? new Date() : null } });
    await registrarLog(tx, ctx.clienteId, {
      acao: concluido ? "marco.concluido" : "marco.reaberto",
      usuarioId: ctx.usuarioId,
      entidade: "MarcoAcao",
      entidadeId: marcoId,
    });
    return { ok: true as const, planoId: marco.acao.planoId };
  });
  if (!r.ok) return r;
  revalidarPlano(r.planoId);
  return { ok: true };
}

export async function excluirMarco(marcoId: string): Promise<Resultado> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(marcoId).success) return { ok: false, erro: "Marco inválido." };

  const r = await comCliente(ctx, async (tx) => {
    const marco = await tx.marcoAcao.findUnique({
      where: { id: marcoId },
      select: { descricao: true, acaoId: true, acao: { select: { planoId: true } } },
    });
    if (!marco) return { ok: false as const, erro: "Marco não encontrado." };
    await tx.marcoAcao.delete({ where: { id: marcoId } });
    await registrarLog(tx, ctx.clienteId, {
      acao: "marco.excluido",
      usuarioId: ctx.usuarioId,
      entidade: "MarcoAcao",
      entidadeId: marcoId,
      dados: { acaoId: marco.acaoId, descricao: marco.descricao },
    });
    return { ok: true as const, planoId: marco.acao.planoId };
  });
  if (!r.ok) return r;
  revalidarPlano(r.planoId);
  return { ok: true };
}
