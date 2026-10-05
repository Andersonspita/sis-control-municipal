"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { StatusAuditoria } from "@/generated/prisma/client";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, type Tx } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { arquivosDoFormulario, comArquivos, registrarDocumentos } from "@/lib/documentos";
import { inserirAuditoria, membrosControle } from "@/lib/dados/auditorias";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import { classificarRisco } from "@/lib/risco";
import {
  numeroAuditoria,
  STATUS_APLICA_CHECKLIST,
  STATUS_AVALIA_CHECKLIST,
  STATUS_EDITA_ACHADOS,
  STATUS_EDITA_PLANEJAMENTO,
  STATUS_GERA_ACAO,
  transicaoPermitida,
} from "@/lib/auditorias";
import { STATUS_AUDITORIA } from "@/lib/rotulos";
import type { EstadoAcao } from "@/lib/acoes";

const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);
const idOpcional = z.union([z.uuid({ error: "Seleção inválida." }), z.literal("")]).optional().transform((v) => v || null);
const dataOpcional = z
  .union([z.iso.date({ error: "Data inválida." }), z.literal("")])
  .optional()
  .transform((v) => (v ? new Date(v) : null));
const escala = (rotulo: string) =>
  z.coerce
    .number({ error: `Informe ${rotulo} de 1 a 5.` })
    .int({ error: `Informe ${rotulo} de 1 a 5.` })
    .min(1, { error: `Informe ${rotulo} de 1 a 5.` })
    .max(5, { error: `Informe ${rotulo} de 1 a 5.` });
const TIPOS = ["CONFORMIDADE", "OPERACIONAL", "FINANCEIRA", "GESTAO", "ESPECIAL"] as const;

function revalidarAuditoria(id: string) {
  revalidatePath(`/auditorias/${id}`);
  revalidatePath("/auditorias");
}

/** Trava a linha da auditoria até o fim da transação (mudanças concorrentes ficam em fila). */
async function travarAuditoria(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM auditorias WHERE id = ${id}::uuid FOR UPDATE`;
  const auditoria = await tx.auditoria.findUnique({
    where: { id },
    select: { id: true, status: true, numero: true, ano: true, titulo: true, equipeIds: true },
  });
  if (!auditoria) throw new ErroNegocio("Auditoria não encontrada.");
  return auditoria;
}

function exigirEtapa(status: StatusAuditoria, permitidas: readonly StatusAuditoria[], oQue: string) {
  if (!permitidas.includes(status)) {
    throw new ErroNegocio(`Na etapa “${STATUS_AUDITORIA[status]}” não é possível ${oQue}.`);
  }
}

async function conferirUnidade(tx: Tx, unidadeId: string | null) {
  if (!unidadeId) return null;
  const unidade = await tx.unidade.findUnique({ where: { id: unidadeId }, select: { nome: true } });
  if (!unidade) throw new ErroNegocio("Unidade não encontrada.");
  return unidade.nome;
}

async function conferirEquipe(clienteId: string, ids: string[]) {
  const membros = new Set((await membrosControle(clienteId)).map((m) => m.id));
  const equipe = [...new Set(ids)];
  if (equipe.some((id) => !membros.has(id))) throw new ErroNegocio("A equipe só pode ter usuários da controladoria.");
  return equipe;
}

// ───────────── Auditoria: dados, equipe e ciclo ─────────────

const esquemaAuditoria = z
  .object({
    titulo: z.string().trim().min(5, { error: "Informe o título (mínimo de 5 caracteres)." }).max(200),
    tipo: z.enum(TIPOS, { error: "Selecione o tipo de auditoria." }),
    objetivo: z.string().trim().min(10, { error: "Descreva o objetivo (mínimo de 10 caracteres)." }).max(5000),
    escopo: textoOpcional(10000),
    criterios: textoOpcional(10000),
    unidadeId: idOpcional,
    inicioPrevisto: dataOpcional,
    fimPrevisto: dataOpcional,
  })
  .refine((d) => !d.inicioPrevisto || !d.fimPrevisto || d.fimPrevisto >= d.inicioPrevisto, {
    error: "O fim previsto não pode ser anterior ao início.",
  });

function equipeDoFormulario(formData: FormData) {
  return formData.getAll("equipe").filter((v): v is string => typeof v === "string" && z.uuid().safeParse(v).success);
}

export async function criarAuditoria(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaAuditoria.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  let id: string;
  try {
    const equipeIds = await conferirEquipe(ctx.clienteId, equipeDoFormulario(formData));
    id = await comCliente(ctx, async (tx) => {
      const unidade = await conferirUnidade(tx, dados.data.unidadeId);
      const a = await inserirAuditoria(tx, ctx, { ...dados.data, equipeIds });
      await registrarLog(tx, ctx.clienteId, {
        acao: "auditoria.criada",
        usuarioId: ctx.usuarioId,
        entidade: "Auditoria",
        entidadeId: a.id,
        dados: { numero: numeroAuditoria(a.numero, a.ano), titulo: dados.data.titulo, tipo: dados.data.tipo, unidade, equipe: equipeIds.length },
      });
      return a.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/auditorias");
  redirect(`/auditorias/${id}`);
}

const CAMPOS_COMPARADOS = ["titulo", "tipo", "objetivo", "escopo", "criterios", "unidadeId"] as const;

export async function editarAuditoria(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { erro: "Auditoria inválida." };
  const dados = esquemaAuditoria.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const auditoriaId = id.data;

  try {
    const equipeIds = await conferirEquipe(ctx.clienteId, equipeDoFormulario(formData));
    await comCliente(ctx, async (tx) => {
      const travada = await travarAuditoria(tx, auditoriaId);
      exigirEtapa(travada.status, STATUS_EDITA_PLANEJAMENTO, "alterar o planejamento");
      if (travada.status !== "PLANEJAMENTO" && !equipeIds.length) throw new ErroNegocio("A auditoria em execução precisa de equipe.");
      await conferirUnidade(tx, dados.data.unidadeId);
      const atual = await tx.auditoria.findUniqueOrThrow({
        where: { id: auditoriaId },
        select: { titulo: true, tipo: true, objetivo: true, escopo: true, criterios: true, unidadeId: true, inicioPrevisto: true, fimPrevisto: true },
      });
      const alterados: string[] = CAMPOS_COMPARADOS.filter((c) => atual[c] !== dados.data[c]);
      if ((atual.inicioPrevisto?.getTime() ?? null) !== (dados.data.inicioPrevisto?.getTime() ?? null)) alterados.push("inicioPrevisto");
      if ((atual.fimPrevisto?.getTime() ?? null) !== (dados.data.fimPrevisto?.getTime() ?? null)) alterados.push("fimPrevisto");
      const equipeAlterada =
        equipeIds.length !== travada.equipeIds.length || equipeIds.some((u) => !travada.equipeIds.includes(u));
      if (equipeAlterada) alterados.push("equipe");
      if (!alterados.length) return;

      await tx.auditoria.update({ where: { id: auditoriaId }, data: { ...dados.data, equipeIds } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "auditoria.atualizada",
        usuarioId: ctx.usuarioId,
        entidade: "Auditoria",
        entidadeId: auditoriaId,
        dados: { alterados, ...(equipeAlterada && { equipe: { de: travada.equipeIds.length, para: equipeIds.length } }) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Auditoria atualizada." };
}

const esquemaStatus = z.object({
  auditoriaId: z.uuid(),
  status: z.enum(Object.keys(STATUS_AUDITORIA) as [StatusAuditoria, ...StatusAuditoria[]], { error: "Etapa inválida." }),
  justificativa: textoOpcional(5000),
});

export async function alterarStatusAuditoria(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaStatus.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const { auditoriaId, status, justificativa } = dados.data;
  if (status === "CANCELADA" && (!justificativa || justificativa.length < 10)) {
    return { erro: "Justifique o cancelamento (mínimo de 10 caracteres)." };
  }

  try {
    await comCliente(ctx, async (tx) => {
      const atual = await travarAuditoria(tx, auditoriaId);
      if (!transicaoPermitida(atual.status, status)) {
        throw new ErroNegocio(`Não é possível passar de “${STATUS_AUDITORIA[atual.status]}” para “${STATUS_AUDITORIA[status]}”.`);
      }
      if ((status === "CANCELADA" || status === "ENCERRADA") && ctx.perfil !== "CONTROLADOR") {
        throw new ErroNegocio("Somente o controlador pode encerrar ou cancelar uma auditoria.");
      }
      if (status === "EXECUCAO" && atual.equipeIds.length === 0) {
        throw new ErroNegocio("Defina a equipe da auditoria antes de iniciar a execução.");
      }
      await tx.auditoria.update({
        where: { id: auditoriaId },
        data: { status, ...(status === "CANCELADA" && { justificativaCancelamento: justificativa }) },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: status === "CANCELADA" ? "auditoria.cancelada" : status === "ENCERRADA" ? "auditoria.encerrada" : "auditoria.status_alterado",
        usuarioId: ctx.usuarioId,
        entidade: "Auditoria",
        entidadeId: auditoriaId,
        dados: { de: atual.status, para: status, ...(justificativa && { justificativa }) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: `Auditoria em “${STATUS_AUDITORIA[status]}”.` };
}

// ───────────── Matriz de planejamento ─────────────

const esquemaQuestao = z.object({
  auditoriaId: z.uuid(),
  questaoId: idOpcional,
  questao: z.string().trim().min(5, { error: "Escreva a questão de auditoria (mínimo de 5 caracteres)." }).max(2000),
  informacoes: textoOpcional(5000),
  fontes: textoOpcional(5000),
  procedimentos: textoOpcional(5000),
});

export async function salvarQuestao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaQuestao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { auditoriaId, questaoId, ...campos } = dados.data;

  try {
    await comCliente(ctx, async (tx) => {
      const a = await travarAuditoria(tx, auditoriaId);
      exigirEtapa(a.status, STATUS_EDITA_PLANEJAMENTO, "alterar a matriz de planejamento");
      if (questaoId) {
        const { count } = await tx.questaoAuditoria.updateMany({ where: { id: questaoId, auditoriaId }, data: campos });
        if (!count) throw new ErroNegocio("Questão não encontrada.");
      } else {
        const ordem = await tx.questaoAuditoria.count({ where: { auditoriaId } });
        await tx.questaoAuditoria.create({ data: { ...campos, auditoriaId, clienteId: ctx.clienteId, ordem: ordem + 1 } });
      }
      await registrarLog(tx, ctx.clienteId, {
        acao: questaoId ? "auditoria.questao_atualizada" : "auditoria.questao_criada",
        usuarioId: ctx.usuarioId,
        entidade: "Auditoria",
        entidadeId: auditoriaId,
        dados: { questao: campos.questao.slice(0, 200) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: questaoId ? "Questão atualizada." : "Questão incluída na matriz." };
}

export async function excluirQuestao(auditoriaId: string, questaoId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(auditoriaId).success || !z.uuid().safeParse(questaoId).success) return { erro: "Questão inválida." };
  try {
    await comCliente(ctx, async (tx) => {
      const a = await travarAuditoria(tx, auditoriaId);
      exigirEtapa(a.status, STATUS_EDITA_PLANEJAMENTO, "alterar a matriz de planejamento");
      const removida = await tx.questaoAuditoria.findFirst({ where: { id: questaoId, auditoriaId }, select: { questao: true } });
      if (!removida) throw new ErroNegocio("Questão não encontrada.");
      await tx.questaoAuditoria.delete({ where: { id: questaoId } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "auditoria.questao_excluida",
        usuarioId: ctx.usuarioId,
        entidade: "Auditoria",
        entidadeId: auditoriaId,
        dados: { questao: removida.questao.slice(0, 200) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Questão excluída." };
}

// ───────────── Checklists ─────────────

export async function aplicarChecklist(auditoriaId: string, modeloId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(auditoriaId).success || !z.uuid().safeParse(modeloId).success) return { erro: "Modelo inválido." };
  try {
    await comCliente(ctx, async (tx) => {
      const a = await travarAuditoria(tx, auditoriaId);
      exigirEtapa(a.status, STATUS_APLICA_CHECKLIST, "aplicar checklists");
      const modelo = await tx.modeloChecklist.findUnique({
        where: { id: modeloId },
        select: { nome: true, ativo: true, _count: { select: { itens: true } } },
      });
      if (!modelo?.ativo) throw new ErroNegocio("Modelo de checklist não encontrado ou inativo.");
      if (!modelo._count.itens) throw new ErroNegocio("O modelo não tem itens.");
      const jaAplicado = await tx.checklistAuditoria.count({ where: { auditoriaId, modeloId } });
      if (jaAplicado) throw new ErroNegocio("Este modelo já foi aplicado à auditoria.");
      const [{ id }] = await tx.$queryRaw<{ id: string }[]>`
        SELECT auditoria_aplicar_checklist(${auditoriaId}::uuid, ${modeloId}::uuid, ${ctx.usuarioId}::uuid) AS id`;
      await registrarLog(tx, ctx.clienteId, {
        acao: "auditoria.checklist_aplicado",
        usuarioId: ctx.usuarioId,
        entidade: "ChecklistAuditoria",
        entidadeId: id,
        dados: { auditoriaId, modelo: modelo.nome, itens: modelo._count.itens },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Checklist aplicado à auditoria." };
}

export async function removerChecklist(auditoriaId: string, checklistId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(auditoriaId).success || !z.uuid().safeParse(checklistId).success) return { erro: "Checklist inválido." };
  try {
    await comCliente(ctx, async (tx) => {
      const a = await travarAuditoria(tx, auditoriaId);
      exigirEtapa(a.status, STATUS_APLICA_CHECKLIST, "remover checklists");
      const checklist = await tx.checklistAuditoria.findFirst({
        where: { id: checklistId, auditoriaId },
        select: { nome: true, _count: { select: { itens: { where: { OR: [{ resultado: { not: null } }, { achados: { some: {} } }, { documentos: { some: {} } }] } } } } },
      });
      if (!checklist) throw new ErroNegocio("Checklist não encontrado.");
      if (checklist._count.itens) throw new ErroNegocio("Há itens avaliados, com evidências ou achados: o checklist não pode ser removido.");
      await tx.checklistAuditoria.delete({ where: { id: checklistId } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "auditoria.checklist_removido",
        usuarioId: ctx.usuarioId,
        entidade: "ChecklistAuditoria",
        entidadeId: checklistId,
        dados: { auditoriaId, nome: checklist.nome },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Checklist removido." };
}

const esquemaAvaliacao = z.object({
  itemId: z.uuid(),
  resultado: z.union([z.enum(["CONFORME", "NAO_CONFORME", "PARCIAL", "NAO_APLICAVEL"]), z.literal("")]).transform((v) => v || null),
  observacao: textoOpcional(5000),
});

export async function avaliarItem(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaAvaliacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Resultado inválido." };
  const { itemId, resultado, observacao } = dados.data;

  let auditoriaId: string;
  try {
    auditoriaId = await comCliente(ctx, async (tx) => {
      const item = await tx.itemChecklistAuditoria.findUnique({
        where: { id: itemId },
        select: { resultado: true, checklist: { select: { auditoriaId: true } } },
      });
      if (!item) throw new ErroNegocio("Item não encontrado.");
      const a = await travarAuditoria(tx, item.checklist.auditoriaId);
      exigirEtapa(a.status, STATUS_AVALIA_CHECKLIST, "avaliar itens do checklist");
      await tx.itemChecklistAuditoria.update({
        where: { id: itemId },
        data: resultado
          ? { resultado, observacao, avaliadoPorId: ctx.usuarioId, avaliadoEm: new Date() }
          : { resultado: null, observacao, avaliadoPorId: null, avaliadoEm: null },
      });
      if (item.resultado !== resultado) {
        await registrarLog(tx, ctx.clienteId, {
          acao: "auditoria.item_avaliado",
          usuarioId: ctx.usuarioId,
          entidade: "ItemChecklistAuditoria",
          entidadeId: itemId,
          dados: { auditoriaId: a.id, de: item.resultado, para: resultado },
        });
      }
      return a.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Item avaliado." };
}

// ───────────── Achados e recomendações ─────────────

const esquemaAchado = z.object({
  auditoriaId: z.uuid(),
  achadoId: idOpcional,
  titulo: z.string().trim().min(5, { error: "Informe o título do achado (mínimo de 5 caracteres)." }).max(300),
  condicao: z.string().trim().min(10, { error: "Descreva a condição (o que foi encontrado)." }).max(10000),
  criterio: z.string().trim().min(5, { error: "Informe o critério (a norma ou referência)." }).max(10000),
  causa: z.string().trim().min(5, { error: "Informe a causa." }).max(10000),
  efeito: z.string().trim().min(5, { error: "Informe o efeito (real ou potencial)." }).max(10000),
  probabilidade: escala("a probabilidade"),
  impacto: escala("o impacto"),
  itemChecklistId: idOpcional,
});

export async function salvarAchado(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaAchado.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { auditoriaId, achadoId, ...campos } = dados.data;

  try {
    await comArquivos(ctx.clienteId, achadoId ? [] : arquivosDoFormulario(formData), (salvos) =>
      comCliente(ctx, async (tx) => {
        const a = await travarAuditoria(tx, auditoriaId);
        exigirEtapa(a.status, STATUS_EDITA_ACHADOS, "registrar ou alterar achados");
        if (campos.itemChecklistId) {
          const item = await tx.itemChecklistAuditoria.count({ where: { id: campos.itemChecklistId, checklist: { auditoriaId } } });
          if (!item) throw new ErroNegocio("O item de checklist não pertence a esta auditoria.");
        }
        const gravidade = classificarRisco(campos.probabilidade, campos.impacto);
        if (achadoId) {
          const { count } = await tx.achado.updateMany({ where: { id: achadoId, auditoriaId }, data: campos });
          if (!count) throw new ErroNegocio("Achado não encontrado.");
          await registrarLog(tx, ctx.clienteId, {
            acao: "achado.atualizado",
            usuarioId: ctx.usuarioId,
            entidade: "Achado",
            entidadeId: achadoId,
            dados: { auditoriaId, titulo: campos.titulo, gravidade },
          });
          return;
        }
        const ultimo = await tx.achado.aggregate({ where: { auditoriaId }, _max: { numero: true } });
        const numero = (ultimo._max.numero ?? 0) + 1;
        const achado = await tx.achado.create({
          data: { ...campos, auditoriaId, numero, clienteId: ctx.clienteId, criadoPorId: ctx.usuarioId },
          select: { id: true },
        });
        await registrarDocumentos(tx, ctx, salvos, { achadoId: achado.id });
        await registrarLog(tx, ctx.clienteId, {
          acao: "achado.criado",
          usuarioId: ctx.usuarioId,
          entidade: "Achado",
          entidadeId: achado.id,
          dados: { auditoriaId, numero, titulo: campos.titulo, gravidade, anexos: salvos.length },
        });
      }),
    );
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: achadoId ? "Achado atualizado." : "Achado registrado." };
}

export async function excluirAchado(auditoriaId: string, achadoId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(auditoriaId).success || !z.uuid().safeParse(achadoId).success) return { erro: "Achado inválido." };
  try {
    await comCliente(ctx, async (tx) => {
      const a = await travarAuditoria(tx, auditoriaId);
      exigirEtapa(a.status, STATUS_EDITA_ACHADOS, "excluir achados");
      const achado = await tx.achado.findFirst({
        where: { id: achadoId, auditoriaId },
        select: { numero: true, titulo: true, _count: { select: { recomendacoes: { where: { acao: { isNot: null } } } } } },
      });
      if (!achado) throw new ErroNegocio("Achado não encontrado.");
      if (achado._count.recomendacoes) throw new ErroNegocio("O achado tem recomendação que já virou ação: não pode ser excluído.");
      await tx.achado.delete({ where: { id: achadoId } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "achado.excluido",
        usuarioId: ctx.usuarioId,
        entidade: "Achado",
        entidadeId: achadoId,
        dados: { auditoriaId, numero: achado.numero, titulo: achado.titulo },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Achado excluído." };
}

const esquemaRecomendacao = z.object({
  achadoId: z.uuid(),
  recomendacaoId: idOpcional,
  texto: z.string().trim().min(10, { error: "Escreva a recomendação (mínimo de 10 caracteres)." }).max(5000),
  unidadeId: idOpcional,
  prazo: dataOpcional,
});

export async function salvarRecomendacao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaRecomendacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { achadoId, recomendacaoId, ...campos } = dados.data;

  let auditoriaId: string;
  try {
    auditoriaId = await comCliente(ctx, async (tx) => {
      const achado = await tx.achado.findUnique({ where: { id: achadoId }, select: { auditoriaId: true, numero: true } });
      if (!achado) throw new ErroNegocio("Achado não encontrado.");
      const a = await travarAuditoria(tx, achado.auditoriaId);
      exigirEtapa(a.status, STATUS_EDITA_ACHADOS, "registrar ou alterar recomendações");
      const unidade = await conferirUnidade(tx, campos.unidadeId);
      if (recomendacaoId) {
        const atual = await tx.recomendacao.findFirst({ where: { id: recomendacaoId, achadoId }, select: { acao: { select: { id: true } } } });
        if (!atual) throw new ErroNegocio("Recomendação não encontrada.");
        if (atual.acao) throw new ErroNegocio("A recomendação já virou ação: ajuste a ação no plano da auditoria.");
        await tx.recomendacao.update({ where: { id: recomendacaoId }, data: campos });
      } else {
        const ultima = await tx.recomendacao.aggregate({ where: { achadoId }, _max: { numero: true } });
        await tx.recomendacao.create({
          data: { ...campos, achadoId, numero: (ultima._max.numero ?? 0) + 1, clienteId: ctx.clienteId, criadoPorId: ctx.usuarioId },
        });
      }
      await registrarLog(tx, ctx.clienteId, {
        acao: recomendacaoId ? "recomendacao.atualizada" : "recomendacao.criada",
        usuarioId: ctx.usuarioId,
        entidade: "Achado",
        entidadeId: achadoId,
        dados: { auditoriaId: a.id, achado: achado.numero, texto: campos.texto.slice(0, 200), unidade },
      });
      return a.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: recomendacaoId ? "Recomendação atualizada." : "Recomendação incluída." };
}

export async function excluirRecomendacao(recomendacaoId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(recomendacaoId).success) return { erro: "Recomendação inválida." };
  let auditoriaId: string;
  try {
    auditoriaId = await comCliente(ctx, async (tx) => {
      const rec = await tx.recomendacao.findUnique({
        where: { id: recomendacaoId },
        select: { texto: true, achadoId: true, achado: { select: { auditoriaId: true, numero: true } }, acao: { select: { id: true } } },
      });
      if (!rec) throw new ErroNegocio("Recomendação não encontrada.");
      const a = await travarAuditoria(tx, rec.achado.auditoriaId);
      exigirEtapa(a.status, STATUS_EDITA_ACHADOS, "excluir recomendações");
      if (rec.acao) throw new ErroNegocio("A recomendação já virou ação: não pode ser excluída.");
      await tx.recomendacao.delete({ where: { id: recomendacaoId } });
      await registrarLog(tx, ctx.clienteId, {
        acao: "recomendacao.excluida",
        usuarioId: ctx.usuarioId,
        entidade: "Achado",
        entidadeId: rec.achadoId,
        dados: { auditoriaId: a.id, achado: rec.achado.numero, texto: rec.texto.slice(0, 200) },
      });
      return a.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  return { ok: true, mensagem: "Recomendação excluída." };
}

/** Transforma a recomendação em ação 5W2H no plano único da auditoria (criado na primeira vez). */
export async function gerarAcaoDaRecomendacao(recomendacaoId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(recomendacaoId).success) return { erro: "Recomendação inválida." };
  let auditoriaId: string;
  let criada = false;
  try {
    auditoriaId = await comCliente(ctx, async (tx) => {
      const rec = await tx.recomendacao.findUnique({
        where: { id: recomendacaoId },
        select: { texto: true, achado: { select: { auditoriaId: true, numero: true } }, acao: { select: { id: true } } },
      });
      if (!rec) throw new ErroNegocio("Recomendação não encontrada.");
      const a = await travarAuditoria(tx, rec.achado.auditoriaId);
      if (rec.acao) return a.id;
      exigirEtapa(a.status, STATUS_GERA_ACAO, "gerar ações");
      const planoExistente = await tx.planoAcao.findUnique({ where: { auditoriaId: a.id }, select: { status: true } });
      if (planoExistente?.status === "CANCELADO") throw new ErroNegocio("O plano de ação da auditoria está cancelado.");

      const [r] = await tx.$queryRaw<{ o_acao_id: string; o_plano_id: string; o_criada: boolean }[]>`
        SELECT * FROM recomendacao_gerar_acao(${recomendacaoId}::uuid, ${ctx.usuarioId}::uuid)`;
      criada = r.o_criada;
      if (!planoExistente) {
        await registrarLog(tx, ctx.clienteId, {
          acao: "plano.criado",
          usuarioId: ctx.usuarioId,
          entidade: "PlanoAcao",
          entidadeId: r.o_plano_id,
          dados: { titulo: `Auditoria ${numeroAuditoria(a.numero, a.ano)} — ${a.titulo}`.slice(0, 200), origem: "AUDITORIA", auditoriaId: a.id },
        });
      }
      if (r.o_criada) {
        await registrarLog(tx, ctx.clienteId, {
          acao: "acao.criada",
          usuarioId: ctx.usuarioId,
          entidade: "Acao",
          entidadeId: r.o_acao_id,
          dados: { planoId: r.o_plano_id, oQue: rec.texto.slice(0, 200), status: "PENDENTE", auditoriaId: a.id, recomendacaoId, achado: rec.achado.numero },
        });
      }
      return a.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarAuditoria(auditoriaId);
  revalidatePath("/planos");
  return { ok: true, mensagem: criada ? "Ação gerada no plano de ação da auditoria." : "A recomendação já tinha ação." };
}
