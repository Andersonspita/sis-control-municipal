import "server-only";
import { z } from "zod";
import { comCliente, db, type ContextoCliente, type Tx } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { PERFIS_CONTROLE } from "@/lib/auth/dal";
import { hojeComoDataSimples } from "@/lib/datas";
import { classificarRisco } from "@/lib/risco";
import { ordenarPorRisco } from "@/lib/auditorias";
import { POR_PAGINA, whereAuditorias, type FiltrosAuditorias } from "@/app/(controle)/auditorias/filtros";
import { acaoVencida, dataIso, percentualExecutado } from "./acoes";

const SELECAO_DOCUMENTO = { id: true, nome: true, tamanho: true, mimeType: true } as const;
const SELECAO_UNIDADE = { id: true, nome: true, sigla: true } as const;

export function rotuloUnidade(u: { nome: string; sigla: string | null }) {
  return u.sigla ? `${u.sigla} — ${u.nome}` : u.nome;
}

/** Usuários da controladoria (Controlador ou Equipe) do cliente: candidatos à equipe de auditoria. */
export async function membrosControle(clienteId: string) {
  const vinculos = await db.vinculoCliente.findMany({
    where: { clienteId, ativo: true, perfil: { in: PERFIS_CONTROLE }, usuario: { ativo: true } },
    orderBy: { usuario: { nome: "asc" } },
    select: { usuario: { select: { id: true, nome: true } } },
  });
  return vinculos.map((v) => v.usuario);
}

async function nomesUsuarios(ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((v): v is string => !!v))];
  if (!unicos.length) return new Map<string, string>();
  const usuarios = await db.usuario.findMany({ where: { id: { in: unicos } }, select: { id: true, nome: true } });
  return new Map(usuarios.map((u) => [u.id, u.nome]));
}

export function anoAtual() {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric" }).format(new Date()));
}

type NovaAuditoria = Omit<Prisma.AuditoriaUncheckedCreateInput, "clienteId" | "numero" | "ano" | "criadoPorId" | "status">;

/** Cria a auditoria com numeração sequencial por cliente e ano, serializada por trava transacional. */
export async function inserirAuditoria(tx: Tx, ctx: ContextoCliente, dados: NovaAuditoria) {
  const ano = anoAtual();
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`auditoria:${ctx.clienteId}:${ano}`}, 0))`;
  const ultima = await tx.auditoria.aggregate({ where: { ano }, _max: { numero: true } });
  const numero = (ultima._max.numero ?? 0) + 1;
  return tx.auditoria.create({
    data: { ...dados, clienteId: ctx.clienteId, numero, ano, criadoPorId: ctx.usuarioId },
    select: { id: true, numero: true, ano: true },
  });
}

export async function listarAuditorias(ctx: ContextoCliente, filtros: FiltrosAuditorias) {
  const where = whereAuditorias(filtros);
  const [unidades, total, auditorias, porStatus] = await comCliente(ctx, (tx) =>
    Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: SELECAO_UNIDADE }),
      tx.auditoria.count({ where }),
      tx.auditoria.findMany({
        where,
        orderBy: [{ ano: "desc" }, { numero: "desc" }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          numero: true,
          ano: true,
          titulo: true,
          tipo: true,
          status: true,
          inicioPrevisto: true,
          fimPrevisto: true,
          unidade: { select: { nome: true, sigla: true } },
          itemPlanoId: true,
          _count: { select: { achados: true, demandas: true } },
        },
      }),
      tx.auditoria.groupBy({ by: ["status"], _count: { _all: true } }),
    ]),
  );
  return {
    unidades,
    total,
    auditorias,
    porStatus: Object.fromEntries(porStatus.map((s) => [s.status, s._count._all])) as Partial<Record<string, number>>,
  };
}

export async function carregarAuditoria(ctx: ContextoCliente, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const dados = await comCliente(ctx, async (tx) => {
    const auditoria = await tx.auditoria.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        ano: true,
        titulo: true,
        tipo: true,
        objetivo: true,
        escopo: true,
        unidadeId: true,
        criterios: true,
        equipeIds: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        status: true,
        justificativaCancelamento: true,
        criadoPorId: true,
        criadoEm: true,
        unidade: { select: SELECAO_UNIDADE },
        itemPlano: { select: { id: true, probabilidade: true, impacto: true, plano: { select: { ano: true } } } },
        questoes: { orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }] },
        checklists: {
          orderBy: { criadoEm: "asc" },
          select: {
            id: true,
            nome: true,
            modeloId: true,
            criadoEm: true,
            itens: {
              orderBy: { ordem: "asc" },
              select: {
                id: true,
                ordem: true,
                texto: true,
                orientacao: true,
                resultado: true,
                observacao: true,
                avaliadoEm: true,
                documentos: { orderBy: { criadoEm: "asc" }, select: SELECAO_DOCUMENTO },
              },
            },
          },
        },
        achados: {
          orderBy: { numero: "asc" },
          select: {
            id: true,
            numero: true,
            titulo: true,
            condicao: true,
            criterio: true,
            causa: true,
            efeito: true,
            probabilidade: true,
            impacto: true,
            itemChecklistId: true,
            itemChecklist: { select: { texto: true, checklist: { select: { nome: true } } } },
            documentos: { orderBy: { criadoEm: "asc" }, select: SELECAO_DOCUMENTO },
            recomendacoes: {
              orderBy: { numero: "asc" },
              select: {
                id: true,
                numero: true,
                texto: true,
                prazo: true,
                unidade: { select: SELECAO_UNIDADE },
                acao: { select: { id: true, status: true, percentual: true, prazo: true } },
              },
            },
          },
        },
        plano: { select: { id: true, titulo: true, status: true, acoes: { select: { status: true, percentual: true, prazo: true } } } },
        demandas: {
          orderBy: [{ ano: "desc" }, { numero: "desc" }],
          select: {
            id: true,
            numero: true,
            ano: true,
            assunto: true,
            prazo: true,
            status: true,
            unidadeDestino: { select: { nome: true, sigla: true } },
          },
        },
        documentos: { orderBy: { criadoEm: "asc" }, select: SELECAO_DOCUMENTO },
      },
    });
    if (!auditoria) return null;
    const [unidades, modelos, logs] = await Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: SELECAO_UNIDADE }),
      tx.modeloChecklist.findMany({
        where: { ativo: true, itens: { some: {} } },
        orderBy: { nome: "asc" },
        select: { id: true, nome: true, _count: { select: { itens: true } } },
      }),
      tx.logAuditoria.findMany({
        where: { OR: [{ entidade: "Auditoria", entidadeId: id }, { dados: { path: ["auditoriaId"], equals: id } }] },
        orderBy: { criadoEm: "desc" },
        take: 150,
        select: { id: true, acao: true, usuarioId: true, criadoEm: true, dados: true },
      }),
    ]);
    return { auditoria, unidades, modelos, logs };
  });
  if (!dados) return null;
  const { auditoria, unidades, modelos, logs } = dados;

  const [membros, nomes] = await Promise.all([
    membrosControle(ctx.clienteId),
    nomesUsuarios([auditoria.criadoPorId, ...auditoria.equipeIds, ...logs.map((l) => l.usuarioId)]),
  ]);
  const hoje = dataIso(hojeComoDataSimples());
  const aplicados = new Set(auditoria.checklists.map((c) => c.modeloId));
  const { plano, criadoPorId, ...resto } = auditoria;

  return {
    auditoria: {
      ...resto,
      criadoPor: nomes.get(criadoPorId) ?? null,
      equipe: auditoria.equipeIds.map((u) => ({ id: u, nome: nomes.get(u) ?? "Usuário removido" })),
      achados: auditoria.achados.map((a) => ({ ...a, nivel: classificarRisco(a.probabilidade, a.impacto) })),
    },
    plano: plano
      ? {
          id: plano.id,
          titulo: plano.titulo,
          status: plano.status,
          totalAcoes: plano.acoes.length,
          concluidas: plano.acoes.filter((a) => a.status === "CONCLUIDA").length,
          vencidas: plano.acoes.filter((a) => acaoVencida(a, hoje)).length,
          executado: percentualExecutado(plano.acoes),
        }
      : null,
    unidades,
    membros,
    modelos: modelos.map((m) => ({ id: m.id, nome: m.nome, itens: m._count.itens, aplicado: aplicados.has(m.id) })),
    historico: logs.map((l) => ({
      id: String(l.id),
      acao: l.acao,
      usuario: l.usuarioId ? (nomes.get(l.usuarioId) ?? null) : null,
      criadoEm: l.criadoEm,
      dados: l.dados,
    })),
  };
}

export type AuditoriaView = NonNullable<Awaited<ReturnType<typeof carregarAuditoria>>>;

/** PAAI do ano (pode não existir ainda), com as auditorias previstas da mais para a menos arriscada. */
export async function carregarPaai(ctx: ContextoCliente, ano: number) {
  const { plano, unidades, anos } = await comCliente(ctx, async (tx) => {
    const [plano, unidades, anos] = await Promise.all([
      tx.planoAnualAuditoria.findUnique({
        where: { clienteId_ano: { clienteId: ctx.clienteId, ano } },
        select: {
          id: true,
          ano: true,
          status: true,
          observacoes: true,
          aprovadoEm: true,
          aprovadoPorId: true,
          itens: {
            select: {
              id: true,
              titulo: true,
              tipo: true,
              objetivo: true,
              unidadeId: true,
              probabilidade: true,
              impacto: true,
              mesInicio: true,
              mesFim: true,
              unidade: { select: { nome: true, sigla: true } },
              auditoria: { select: { id: true, numero: true, ano: true, status: true } },
            },
          },
        },
      }),
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: SELECAO_UNIDADE }),
      tx.planoAnualAuditoria.findMany({ orderBy: { ano: "desc" }, select: { ano: true, status: true } }),
    ]);
    return { plano, unidades, anos };
  });
  const nomes = await nomesUsuarios([plano?.aprovadoPorId]);
  return {
    plano: plano
      ? {
          ...plano,
          aprovadoPor: plano.aprovadoPorId ? (nomes.get(plano.aprovadoPorId) ?? null) : null,
          itens: ordenarPorRisco(plano.itens).map((i) => ({ ...i, nivel: classificarRisco(i.probabilidade, i.impacto) })),
        }
      : null,
    unidades,
    anos,
  };
}

export async function listarModelos(ctx: ContextoCliente) {
  return comCliente(ctx, (tx) =>
    tx.modeloChecklist.findMany({
      orderBy: [{ ativo: "desc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        descricao: true,
        tipo: true,
        ativo: true,
        _count: { select: { itens: true, aplicacoes: true } },
      },
    }),
  );
}

export async function carregarModelo(ctx: ContextoCliente, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return comCliente(ctx, (tx) =>
    tx.modeloChecklist.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        descricao: true,
        tipo: true,
        ativo: true,
        itens: { orderBy: { ordem: "asc" }, select: { id: true, ordem: true, texto: true, orientacao: true } },
        _count: { select: { aplicacoes: true } },
      },
    }),
  );
}
