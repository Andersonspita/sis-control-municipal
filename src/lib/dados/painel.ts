import "server-only";
import { comCliente, db } from "@/lib/db";
import type { Contexto } from "@/lib/auth/dal";
import { hojeComoDataSimples as hoje } from "@/lib/datas";
import { STATUS_ABERTOS as ABERTAS } from "@/lib/demandas";
import { calcularConformidade, percentual } from "./conformidade";
import { STATUS_ABERTOS } from "./acoes";

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
    const [
      demandasAbertas,
      demandasVencidas,
      aguardandoAnalise,
      acoesPendentes,
      acoesAtrasadas,
      acoesAbertas,
      acoesVencidas,
      acoesAguardandoValidacao,
      acoesConcluidas,
      unidades,
      ciclos,
      recentes,
    ] = await Promise.all([
      tx.demanda.count({ where: { status: { in: [...ABERTAS] } } }),
      // Mesma regra de estaVencida(): prazo passado e demanda não encerrada.
      tx.demanda.count({ where: { status: { in: ABERTAS }, prazo: { lt: hoje() } } }),
      tx.demanda.count({ where: { status: "RESPONDIDA" } }),
      tx.acao.count({ where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] } } }),
      tx.acao.count({ where: { status: { in: ["PENDENTE", "EM_ANDAMENTO"] }, prazo: { lt: hoje() } } }),
      tx.acao.count({ where: { status: { in: STATUS_ABERTOS } } }),
      tx.acao.count({ where: { status: { in: STATUS_ABERTOS }, prazo: { lt: hoje() } } }),
      tx.acao.count({ where: { status: "AGUARDANDO_VALIDACAO" } }),
      tx.acao.count({ where: { status: "CONCLUIDA" } }),
      tx.unidade.count({ where: { ativo: true } }),
      tx.cicloAvaliacao.findMany({
        where: { status: { not: "ARQUIVADO" } },
        // Ciclos da entidade inteira têm preferência sobre ciclos de uma unidade.
        orderBy: [{ dataInicio: "desc" }, { criadoEm: "desc" }],
        select: {
          id: true,
          normaId: true,
          unidadeId: true,
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
      const daNorma = ciclos.filter((c) => c.normaId === n.id);
      const ciclo = daNorma.find((c) => c.unidadeId === null) ?? daNorma[0];
      const resultado = calcularConformidade(ciclo?.respostas ?? []);
      return {
        normaId: n.id,
        codigo: n.codigo,
        titulo: n.titulo,
        totalRequisitos: ciclo ? resultado.total : n._count.requisitos,
        ciclo: ciclo ? { id: ciclo.id, nome: ciclo.nome, status: ciclo.status } : null,
        avaliados: resultado.avaliados,
        contagem: resultado.contagem,
        indice: resultado.indice,
        percentual: percentual(resultado.indice),
      };
    });

    return {
      demandasAbertas,
      demandasVencidas,
      aguardandoAnalise,
      acoesPendentes,
      acoesAtrasadas,
      acoes: {
        abertas: acoesAbertas,
        vencidas: acoesVencidas,
        aguardandoValidacao: acoesAguardandoValidacao,
        concluidas: acoesConcluidas,
      },
      unidades,
      aderencia,
      recentes,
    };
  });
}
