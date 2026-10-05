import "server-only";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import type { Contexto } from "@/lib/auth/dal";
import type { Macrofuncao, SituacaoRequisito, StatusDemanda, TipoRequisito } from "@/generated/prisma/client";
import type { Anexo } from "@/components/anexos/lista-anexos";
import { calcularConformidade } from "./conformidade";

export type NoRequisito = {
  id: string;
  paiId: string | null;
  codigo: string;
  titulo: string;
  descricao: string | null;
  orientacao: string | null;
  fundamento: string | null;
  avaliavel: boolean;
  tipo: TipoRequisito | null;
  peso: number;
  macrofuncoes: Macrofuncao[];
};

export type RespostaView = {
  id: string;
  requisitoId: string;
  situacao: SituacaoRequisito;
  observacao: string | null;
  evidencia: string | null;
  respondidoEm: string | null;
  respondidoPor: string | null;
  documentos: Anexo[];
  /** Demandas enviadas às unidades pedindo evidência deste requisito. */
  demandas: { id: string; numero: number; ano: number; status: StatusDemanda }[];
};

/** Requisitos que entram num ciclo: avaliáveis (não agrupadores) e aplicáveis ao tipo do cliente. */
export async function requisitosDoCiclo(normaId: string, tipo: Contexto["cliente"]["tipo"]) {
  return db.requisito.findMany({
    where: { normaId, avaliavel: true, tiposEntidade: { has: tipo } },
    select: { id: true },
    orderBy: { ordem: "asc" },
  });
}

export async function listarCiclos(ctx: Contexto) {
  const ciclos = await comCliente(ctx, (tx) =>
    tx.cicloAvaliacao.findMany({
      orderBy: [{ dataInicio: "desc" }, { criadoEm: "desc" }],
      select: {
        id: true,
        nome: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        norma: { select: { id: true, codigo: true, titulo: true } },
        unidade: { select: { nome: true, sigla: true } },
        respostas: { select: { situacao: true, requisito: { select: { peso: true } } } },
        _count: { select: { planos: true } },
      },
    }),
  );
  return ciclos.map(({ respostas, ...c }) => ({
    ...c,
    conformidade: calcularConformidade(respostas.map((r) => ({ situacao: r.situacao, peso: r.requisito.peso }))),
  }));
}

export async function carregarCiclo(ctx: Contexto, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const dados = await comCliente(ctx, async (tx) => {
    const ciclo = await tx.cicloAvaliacao.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        concluidoEm: true,
        criadoEm: true,
        normaId: true,
        unidadeId: true,
        norma: { select: { id: true, codigo: true, titulo: true } },
        unidade: { select: { nome: true, sigla: true } },
        respostas: {
          select: {
            id: true,
            requisitoId: true,
            situacao: true,
            observacao: true,
            evidencia: true,
            respondidoEm: true,
            respondidoPorId: true,
            documentos: {
              select: { id: true, nome: true, tamanho: true, mimeType: true },
              orderBy: { criadoEm: "asc" },
            },
            demandas: {
              select: { id: true, numero: true, ano: true, status: true },
              orderBy: { criadoEm: "asc" },
            },
          },
        },
        planos: {
          where: { status: { not: "CANCELADO" } },
          select: { id: true, titulo: true, _count: { select: { acoes: true } } },
          orderBy: { criadoEm: "asc" },
        },
      },
    });
    if (!ciclo) return null;
    const anterior = await tx.cicloAvaliacao.findFirst({
      where: {
        id: { not: ciclo.id },
        normaId: ciclo.normaId,
        unidadeId: ciclo.unidadeId,
        status: "CONCLUIDO",
        OR: [
          { dataInicio: { lt: ciclo.dataInicio } },
          { dataInicio: ciclo.dataInicio, criadoEm: { lt: ciclo.criadoEm } },
        ],
      },
      orderBy: [{ dataInicio: "desc" }, { criadoEm: "desc" }],
      select: { id: true, nome: true, dataInicio: true, respostas: { select: { requisitoId: true, situacao: true } } },
    });
    return { ciclo, anterior };
  });
  if (!dados) return null;
  const { ciclo, anterior } = dados;

  const [requisitos, usuarios] = await Promise.all([
    db.requisito.findMany({
      where: { normaId: ciclo.normaId },
      orderBy: { ordem: "asc" },
      select: {
        id: true,
        paiId: true,
        codigo: true,
        titulo: true,
        descricao: true,
        orientacao: true,
        fundamento: true,
        avaliavel: true,
        tipo: true,
        peso: true,
        macrofuncoes: true,
      },
    }),
    db.usuario.findMany({
      where: { id: { in: [...new Set(ciclo.respostas.map((r) => r.respondidoPorId).filter((v): v is string => !!v))] } },
      select: { id: true, nome: true },
    }),
  ]);

  // Só os nós que levam a algum requisito do ciclo (os próprios e seus ancestrais).
  const porId = new Map(requisitos.map((r) => [r.id, r]));
  const usados = new Set<string>();
  for (const r of ciclo.respostas) {
    let atual: string | null = r.requisitoId;
    while (atual && !usados.has(atual)) {
      usados.add(atual);
      atual = porId.get(atual)?.paiId ?? null;
    }
  }
  const nos: NoRequisito[] = requisitos.filter((r) => usados.has(r.id));
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));

  const respostas: RespostaView[] = ciclo.respostas.map((r) => ({
    id: r.id,
    requisitoId: r.requisitoId,
    situacao: r.situacao,
    observacao: r.observacao,
    evidencia: r.evidencia,
    respondidoEm: r.respondidoEm?.toISOString() ?? null,
    respondidoPor: r.respondidoPorId ? (nomes.get(r.respondidoPorId) ?? null) : null,
    documentos: r.documentos,
    demandas: r.demandas,
  }));

  return {
    ciclo: {
      id: ciclo.id,
      nome: ciclo.nome,
      status: ciclo.status,
      dataInicio: ciclo.dataInicio,
      dataFim: ciclo.dataFim,
      concluidoEm: ciclo.concluidoEm,
      norma: ciclo.norma,
      unidade: ciclo.unidade,
      planos: ciclo.planos,
    },
    nos,
    respostas,
    anterior: anterior
      ? {
          id: anterior.id,
          nome: anterior.nome,
          dataInicio: anterior.dataInicio,
          respostas: anterior.respostas,
        }
      : null,
  };
}
