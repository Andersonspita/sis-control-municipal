import "server-only";
import { comCliente, db, type ContextoCliente } from "@/lib/db";
import type { SituacaoRequisito, StatusCiclo, StatusSugestaoIA, TipoAnaliseIA } from "@/generated/prisma/client";
import { esquemaConteudoSugestao, type ConteudoSugestao } from "./analises";
import type { CitacaoConferida } from "./citacoes";

export type SugestaoView = {
  id: string;
  status: StatusSugestaoIA;
  conteudo: ConteudoSugestao;
  citacoes: CitacaoConferida[];
  citacoesDescartadas: number;
  criadoEm: Date;
  revisadoEm: Date | null;
  revisadoPor: string | null;
  motivoRejeicao: string | null;
  tipo: TipoAnaliseIA;
  resposta: {
    id: string;
    situacao: SituacaoRequisito;
    requisito: { codigo: string; titulo: string };
    ciclo: { id: string; nome: string; status: StatusCiclo; norma: string };
  } | null;
};

export async function listarSugestoes(ctx: ContextoCliente, filtro: { cicloId?: string; pendentes: boolean }): Promise<SugestaoView[]> {
  const linhas = await comCliente(ctx, (tx) =>
    tx.sugestaoIA.findMany({
      where: {
        ...(filtro.pendentes ? { status: "PENDENTE_REVISAO" } : { status: { not: "PENDENTE_REVISAO" } }),
        ...(filtro.cicloId ? { respostaRequisito: { cicloId: filtro.cicloId } } : {}),
      },
      orderBy: [{ criadoEm: "desc" }, { id: "asc" }],
      take: 200,
      select: {
        id: true,
        status: true,
        conteudo: true,
        citacoes: true,
        citacoesDescartadas: true,
        criadoEm: true,
        revisadoEm: true,
        revisadoPorId: true,
        motivoRejeicao: true,
        analise: { select: { tipo: true } },
        respostaRequisito: {
          select: {
            id: true,
            situacao: true,
            requisito: { select: { codigo: true, titulo: true, ordem: true } },
            ciclo: { select: { id: true, nome: true, status: true, norma: { select: { codigo: true } } } },
          },
        },
      },
    }),
  );
  const revisores = [...new Set(linhas.map((l) => l.revisadoPorId).filter((v): v is string => !!v))];
  const nomes = new Map((await db.usuario.findMany({ where: { id: { in: revisores } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  return linhas.map((l) => {
    const r = l.respostaRequisito;
    return {
      id: l.id,
      status: l.status,
      conteudo: esquemaConteudoSugestao.parse(l.conteudo),
      citacoes: l.citacoes as unknown as CitacaoConferida[],
      citacoesDescartadas: l.citacoesDescartadas,
      criadoEm: l.criadoEm,
      revisadoEm: l.revisadoEm,
      revisadoPor: l.revisadoPorId ? (nomes.get(l.revisadoPorId) ?? null) : null,
      motivoRejeicao: l.motivoRejeicao,
      tipo: l.analise.tipo,
      resposta: r
        ? {
            id: r.id,
            situacao: r.situacao,
            requisito: { codigo: r.requisito.codigo, titulo: r.requisito.titulo },
            ciclo: { id: r.ciclo.id, nome: r.ciclo.nome, status: r.ciclo.status, norma: r.ciclo.norma.codigo },
          }
        : null,
    };
  });
}

export async function listarAnalises(ctx: ContextoCliente, filtro: { documentoId?: string; cicloId?: string }, limite = 20) {
  const linhas = await comCliente(ctx, (tx) =>
    tx.analiseIA.findMany({
      where: {
        ...(filtro.documentoId ? { documentoIds: { has: filtro.documentoId } } : {}),
        ...(filtro.cicloId ? { cicloId: filtro.cicloId } : {}),
      },
      orderBy: { criadoEm: "desc" },
      take: limite,
      select: {
        id: true,
        tipo: true,
        status: true,
        modelo: true,
        provedor: true,
        custoUsd: true,
        tokensEntrada: true,
        tokensSaida: true,
        erro: true,
        resumo: true,
        criadoEm: true,
        solicitadoPorId: true,
        documentoIds: true,
        _count: { select: { sugestoes: { where: { status: "PENDENTE_REVISAO" } } } },
      },
    }),
  );
  const ids = [...new Set(linhas.map((l) => l.solicitadoPorId))];
  const nomes = new Map((await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]));
  return linhas.map((l) => ({
    ...l,
    custoUsd: Number(l.custoUsd),
    solicitadoPor: nomes.get(l.solicitadoPorId) ?? "—",
    pendentes: l._count.sugestoes,
    resumo: (l.resumo ?? {}) as { sugestoes?: number; semRelacao?: number; semCitacao?: number; citacoesDescartadas?: number },
  }));
}

/** Sugestões pendentes por resposta do ciclo (indicador no cartão do requisito). */
export async function pendentesPorResposta(ctx: ContextoCliente, cicloId: string) {
  const linhas = await comCliente(ctx, (tx) =>
    tx.sugestaoIA.groupBy({
      by: ["respostaRequisitoId"],
      where: { status: "PENDENTE_REVISAO", respostaRequisito: { cicloId } },
      _count: { _all: true },
    }),
  );
  return Object.fromEntries(linhas.filter((l) => l.respostaRequisitoId).map((l) => [l.respostaRequisitoId!, l._count._all]));
}
