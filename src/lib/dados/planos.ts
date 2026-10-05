import "server-only";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import type { Contexto } from "@/lib/auth/dal";
import { hojeComoDataSimples } from "@/lib/datas";
import { acaoVencida, dataIso, percentualExecutado } from "./acoes";

export async function listarPlanos(ctx: Contexto) {
  const hoje = dataIso(hojeComoDataSimples());
  const planos = await comCliente(ctx, (tx) =>
    tx.planoAcao.findMany({
      orderBy: { criadoEm: "desc" },
      select: {
        id: true,
        titulo: true,
        origem: true,
        status: true,
        criadoEm: true,
        ciclo: { select: { id: true, nome: true, norma: { select: { codigo: true } } } },
        acoes: { select: { status: true, percentual: true, prazo: true } },
      },
    }),
  );
  return planos.map(({ acoes, ...p }) => ({
    ...p,
    totalAcoes: acoes.length,
    concluidas: acoes.filter((a) => a.status === "CONCLUIDA").length,
    vencidas: acoes.filter((a) => acaoVencida(a, hoje)).length,
    executado: percentualExecutado(acoes),
  }));
}

export async function carregarPlano(ctx: Contexto, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const dados = await comCliente(ctx, async (tx) => {
    const plano = await tx.planoAcao.findUnique({
      where: { id },
      select: {
        id: true,
        titulo: true,
        descricao: true,
        origem: true,
        status: true,
        criadoEm: true,
        criadoPorId: true,
        ciclo: { select: { id: true, nome: true, norma: { select: { codigo: true } } } },
        situacao: { select: { id: true, numero: true, ano: true, titulo: true } },
        acoes: {
          orderBy: [{ criadoEm: "asc" }],
          select: {
            id: true,
            oQue: true,
            porQue: true,
            onde: true,
            responsavel: true,
            unidadeResponsavelId: true,
            prazo: true,
            como: true,
            custoEstimado: true,
            status: true,
            prioridade: true,
            percentual: true,
            validadoPorId: true,
            validadoEm: true,
            parecerValidacao: true,
            unidadeResponsavel: { select: { nome: true, sigla: true } },
            respostaRequisito: {
              select: { situacao: true, cicloId: true, requisito: { select: { codigo: true, titulo: true } } },
            },
            marcos: {
              orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
              select: { id: true, descricao: true, prazo: true, concluidoEm: true },
            },
            documentos: {
              orderBy: { criadoEm: "asc" },
              select: { id: true, nome: true, tamanho: true, mimeType: true },
            },
          },
        },
      },
    });
    if (!plano) return null;
    const unidades = await tx.unidade.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, sigla: true },
    });
    return { plano, unidades };
  });
  if (!dados) return null;
  const { plano, unidades } = dados;

  const idsUsuarios = [plano.criadoPorId, ...plano.acoes.map((a) => a.validadoPorId)].filter((v): v is string => !!v);
  const usuarios = await db.usuario.findMany({ where: { id: { in: [...new Set(idsUsuarios)] } }, select: { id: true, nome: true } });
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const hoje = dataIso(hojeComoDataSimples());

  const acoes = plano.acoes.map((a) => ({
    id: a.id,
    oQue: a.oQue,
    porQue: a.porQue,
    onde: a.onde,
    responsavel: a.responsavel,
    unidadeResponsavelId: a.unidadeResponsavelId,
    unidadeResponsavel: a.unidadeResponsavel,
    prazo: a.prazo ? dataIso(a.prazo) : null,
    como: a.como,
    custoEstimado: a.custoEstimado === null ? null : a.custoEstimado.toString(),
    status: a.status,
    prioridade: a.prioridade,
    percentual: a.percentual,
    validadoPor: a.validadoPorId ? (nomes.get(a.validadoPorId) ?? null) : null,
    validadoEm: a.validadoEm?.toISOString() ?? null,
    parecerValidacao: a.parecerValidacao,
    requisito: a.respostaRequisito
      ? {
          codigo: a.respostaRequisito.requisito.codigo,
          titulo: a.respostaRequisito.requisito.titulo,
          situacao: a.respostaRequisito.situacao,
          cicloId: a.respostaRequisito.cicloId,
        }
      : null,
    marcos: a.marcos.map((m) => ({
      id: m.id,
      descricao: m.descricao,
      prazo: m.prazo ? dataIso(m.prazo) : null,
      concluido: m.concluidoEm !== null,
    })),
    documentos: a.documentos,
    vencida: acaoVencida(a, hoje),
  }));

  return {
    plano: {
      id: plano.id,
      titulo: plano.titulo,
      descricao: plano.descricao,
      origem: plano.origem,
      status: plano.status,
      criadoEm: plano.criadoEm,
      criadoPor: nomes.get(plano.criadoPorId) ?? null,
      ciclo: plano.ciclo,
      situacao: plano.situacao,
    },
    acoes,
    unidades,
    hoje,
    resumo: {
      total: acoes.length,
      abertas: acoes.filter((a) => a.status === "PENDENTE" || a.status === "EM_ANDAMENTO").length,
      aguardando: acoes.filter((a) => a.status === "AGUARDANDO_VALIDACAO").length,
      concluidas: acoes.filter((a) => a.status === "CONCLUIDA").length,
      vencidas: acoes.filter((a) => a.vencida).length,
      executado: percentualExecutado(acoes),
    },
  };
}

export type AcaoView = NonNullable<Awaited<ReturnType<typeof carregarPlano>>>["acoes"][number];
export type UnidadeOpcao = { id: string; nome: string; sigla: string | null };
