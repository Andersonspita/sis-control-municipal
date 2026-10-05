// Geração do plano de ação a partir de um ciclo de autoavaliação.
// Sem "server-only" para ser reaproveitado pelo seed; no app, chamar sempre dentro de `comCliente`.

import type { Prisma } from "@/generated/prisma/client";
import { GERA_ACAO } from "./conformidade";

type Cliente = Prisma.TransactionClient;

export type ResultadoGeracao = { planoId: string | null; criadas: number; planoNovo: boolean };

/**
 * Cria (ou reaproveita) o plano de origem REQUISITO do ciclo e adiciona uma ação para cada resposta
 * Não atende / Atende parcialmente que ainda não tenha ação. Idempotente.
 */
export async function gerarPlanoDoCiclo(
  tx: Cliente,
  p: { clienteId: string; cicloId: string; usuarioId: string },
): Promise<ResultadoGeracao> {
  // Serializa gerações concorrentes do mesmo ciclo.
  await tx.$queryRaw`SELECT id FROM ciclos_avaliacao WHERE id = ${p.cicloId}::uuid FOR UPDATE`;

  const ciclo = await tx.cicloAvaliacao.findUnique({
    where: { id: p.cicloId },
    select: {
      id: true,
      nome: true,
      unidadeId: true,
      norma: { select: { codigo: true } },
      unidade: { select: { nome: true, sigla: true } },
    },
  });
  if (!ciclo) throw new Error("Ciclo não encontrado");

  const lacunas = await tx.respostaRequisito.findMany({
    where: { cicloId: ciclo.id, situacao: { in: GERA_ACAO }, acoes: { none: {} } },
    select: {
      id: true,
      situacao: true,
      observacao: true,
      requisito: { select: { codigo: true, titulo: true, ordem: true } },
    },
    orderBy: { requisito: { ordem: "asc" } },
  });

  let plano = await tx.planoAcao.findFirst({
    where: { cicloId: ciclo.id, origem: "REQUISITO", status: { not: "CANCELADO" } },
    orderBy: { criadoEm: "asc" },
    select: { id: true },
  });
  if (!lacunas.length) return { planoId: plano?.id ?? null, criadas: 0, planoNovo: false };

  let planoNovo = false;
  if (!plano) {
    plano = await tx.planoAcao.create({
      data: {
        clienteId: p.clienteId,
        cicloId: ciclo.id,
        titulo: `Plano de ação — ${ciclo.nome} (${ciclo.norma.codigo})`,
        descricao: "Ações para sanar os requisitos não atendidos ou parcialmente atendidos na autoavaliação.",
        origem: "REQUISITO",
        status: "EM_EXECUCAO",
        criadoPorId: p.usuarioId,
      },
      select: { id: true },
    });
    planoNovo = true;
  }

  const planoId = plano.id;
  const onde = ciclo.unidade ? (ciclo.unidade.sigla ? `${ciclo.unidade.sigla} — ${ciclo.unidade.nome}` : ciclo.unidade.nome) : null;
  await tx.acao.createMany({
    data: lacunas.map((r) => ({
      clienteId: p.clienteId,
      planoId,
      respostaRequisitoId: r.id,
      unidadeResponsavelId: ciclo.unidadeId,
      oQue: `Adequar ao requisito ${r.requisito.codigo} (${ciclo.norma.codigo}): ${r.requisito.titulo}`,
      porQue:
        r.observacao?.trim() ||
        `Requisito avaliado como ${r.situacao === "NAO_ATENDIDO" ? "não atendido" : "parcialmente atendido"} em ${ciclo.nome}.`,
      onde,
      prioridade: r.situacao === "NAO_ATENDIDO" ? ("ALTA" as const) : ("MEDIA" as const),
    })),
  });

  return { planoId, criadas: lacunas.length, planoNovo };
}
