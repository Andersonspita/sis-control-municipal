import "server-only";
import { comCliente, db } from "@/lib/db";
import type { Contexto } from "@/lib/auth/dal";

import { hojeComoDataSimples as hoje } from "@/lib/datas";

const ABERTAS = ["ENVIADA", "VISUALIZADA", "RESPONDIDA", "EM_ANALISE", "DEVOLVIDA"] as const;

export async function resumoPainel(ctx: Contexto) {
  const normas = await db.norma.findMany({
    where: { ativo: true },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      _count: { select: { requisitos: { where: { avaliavel: true, tiposEntidade: { has: ctx.cliente.tipo } } } } },
    },
    orderBy: { codigo: "asc" },
  });

  return comCliente(ctx, async (tx) => {
    const [demandasAbertas, demandasVencidas, aguardandoAnalise, acoesPendentes, acoesAtrasadas, unidades, ciclos, recentes] =
      await Promise.all([
        tx.demanda.count({ where: { status: { in: [...ABERTAS] } } }),
        tx.demanda.count({ where: { status: { in: ["ENVIADA", "VISUALIZADA", "DEVOLVIDA"] }, prazo: { lt: hoje() } } }),
        tx.demanda.count({ where: { status: "RESPONDIDA" } }),
        tx.acao.count({ where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] } } }),
        tx.acao.count({ where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] }, prazo: { lt: hoje() } } }),
        tx.unidade.count({ where: { ativo: true } }),
        tx.cicloAvaliacao.findMany({
          where: { status: { not: "ARQUIVADO" } },
          orderBy: { dataInicio: "desc" },
          select: {
            id: true,
            normaId: true,
            nome: true,
            status: true,
            respostas: { select: { situacao: true } },
          },
        }),
        tx.tramitacaoDemanda.findMany({
          orderBy: { criadoEm: "desc" },
          take: 6,
          select: {
            id: true,
            tipo: true,
            usuarioNome: true,
            criadoEm: true,
            demanda: { select: { numero: true, ano: true, assunto: true } },
          },
        }),
      ]);

    const aderencia = normas.map((n) => {
      const ciclo = ciclos.find((c) => c.normaId === n.id);
      const respostas = ciclo?.respostas ?? [];
      const aplicaveis = respostas.filter((r) => r.situacao !== "NAO_APLICAVEL");
      const pontos = aplicaveis.reduce(
        (s, r) => s + (r.situacao === "ATENDIDO" ? 1 : r.situacao === "PARCIALMENTE_ATENDIDO" ? 0.5 : 0),
        0,
      );
      const avaliados = respostas.filter((r) => r.situacao !== "NAO_AVALIADO").length;
      return {
        normaId: n.id,
        codigo: n.codigo,
        titulo: n.titulo,
        totalRequisitos: n._count.requisitos,
        ciclo: ciclo ? { id: ciclo.id, nome: ciclo.nome, status: ciclo.status } : null,
        avaliados,
        percentual: aplicaveis.length ? Math.round((pontos / aplicaveis.length) * 100) : null,
      };
    });

    return { demandasAbertas, demandasVencidas, aguardandoAnalise, acoesPendentes, acoesAtrasadas, unidades, aderencia, recentes };
  });
}
