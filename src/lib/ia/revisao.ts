import "server-only";
import { z } from "zod";
import { comCliente, type ContextoCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { validarResposta } from "@/lib/dados/conformidade";
import { ErroNegocio } from "@/lib/erros";
import type { Prisma } from "@/generated/prisma/client";
import { esquemaConteudoSugestao } from "./analises";

export const esquemaEdicao = z.object({
  situacao: esquemaConteudoSugestao.shape.situacao,
  justificativa: z.string().trim().max(4000),
  evidencia: z.string().trim().max(4000).optional().transform((v) => v || null),
});
export type EdicaoSugestao = z.input<typeof esquemaEdicao>;

/** Observação gravada na resposta: a justificativa e, quando houver, o que falta comprovar. */
function observacaoDaSugestao(justificativa: string, faltantes: string[]) {
  const falta = faltantes.filter((f) => f.trim());
  return (falta.length ? `${justificativa}\nFalta comprovar: ${falta.join("; ")}.` : justificativa).slice(0, 4000);
}

/**
 * Aceita a sugestão (como veio ou com a edição do controlador) e aplica a resposta ao requisito,
 * com as mesmas regras de `salvarResposta`: ciclo em andamento e justificativa quando exigida.
 */
export async function aceitarSugestao(ctx: ContextoCliente, sugestaoId: string, edicao?: EdicaoSugestao) {
  if (ctx.perfil === "SATELITE") throw new ErroNegocio("A IA é de uso exclusivo da controladoria.");
  const editado = edicao ? esquemaEdicao.safeParse(edicao) : null;
  if (editado && !editado.success) throw new ErroNegocio(editado.error.issues[0]?.message ?? "Dados inválidos.");

  return comCliente(ctx, async (tx) => {
    const s = await tx.sugestaoIA.findUnique({
      where: { id: sugestaoId },
      select: {
        status: true,
        conteudo: true,
        analiseId: true,
        respostaRequisito: {
          select: { id: true, situacao: true, cicloId: true, ciclo: { select: { status: true } }, requisito: { select: { codigo: true } } },
        },
      },
    });
    if (!s) throw new ErroNegocio("Sugestão não encontrada.");
    if (s.status !== "PENDENTE_REVISAO") throw new ErroNegocio("Esta sugestão já foi revisada.");
    const resposta = s.respostaRequisito;
    if (!resposta) throw new ErroNegocio("A resposta do requisito não existe mais.");
    if (resposta.ciclo.status !== "EM_ANDAMENTO") throw new ErroNegocio("Ciclo encerrado: as respostas não podem mais ser alteradas.");

    const sugerido = esquemaConteudoSugestao.parse(s.conteudo);
    const aplicado = editado
      ? { situacao: editado.data.situacao, observacao: editado.data.justificativa || null, evidencia: editado.data.evidencia }
      : { situacao: sugerido.situacao, observacao: observacaoDaSugestao(sugerido.justificativa, sugerido.faltantes), evidencia: sugerido.evidencia };
    const erro = validarResposta(aplicado.situacao, aplicado.observacao);
    if (erro) throw new ErroNegocio(erro);

    await tx.respostaRequisito.update({
      where: { id: resposta.id },
      data: { ...aplicado, respondidoPorId: ctx.usuarioId, respondidoEm: new Date() },
    });
    const status = editado ? "EDITADA" : "ACEITA";
    await tx.sugestaoIA.update({
      where: { id: sugestaoId },
      data: { status, conteudoAplicado: aplicado as Prisma.InputJsonValue, revisadoPorId: ctx.usuarioId, revisadoEm: new Date() },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "resposta.salva",
      usuarioId: ctx.usuarioId,
      entidade: "RespostaRequisito",
      entidadeId: resposta.id,
      dados: { cicloId: resposta.cicloId, requisito: resposta.requisito.codigo, de: resposta.situacao, para: aplicado.situacao, origem: "sugestao_ia", sugestaoId },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: editado ? "ia.sugestao.editada" : "ia.sugestao.aceita",
      usuarioId: ctx.usuarioId,
      entidade: "SugestaoIA",
      entidadeId: sugestaoId,
      dados: { analiseId: s.analiseId, respostaRequisitoId: resposta.id, situacao: aplicado.situacao },
    });
    return { cicloId: resposta.cicloId, status };
  });
}

export async function rejeitarSugestao(ctx: ContextoCliente, sugestaoId: string, motivo?: string | null) {
  if (ctx.perfil === "SATELITE") throw new ErroNegocio("A IA é de uso exclusivo da controladoria.");
  return comCliente(ctx, async (tx) => {
    const s = await tx.sugestaoIA.findUnique({ where: { id: sugestaoId }, select: { status: true, analiseId: true, respostaRequisitoId: true } });
    if (!s) throw new ErroNegocio("Sugestão não encontrada.");
    if (s.status !== "PENDENTE_REVISAO") throw new ErroNegocio("Esta sugestão já foi revisada.");
    await tx.sugestaoIA.update({
      where: { id: sugestaoId },
      data: { status: "REJEITADA", motivoRejeicao: motivo?.trim().slice(0, 1000) || null, revisadoPorId: ctx.usuarioId, revisadoEm: new Date() },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "ia.sugestao.rejeitada",
      usuarioId: ctx.usuarioId,
      entidade: "SugestaoIA",
      entidadeId: sugestaoId,
      dados: { analiseId: s.analiseId, respostaRequisitoId: s.respostaRequisitoId, motivo: motivo?.trim() || null },
    });
  });
}
