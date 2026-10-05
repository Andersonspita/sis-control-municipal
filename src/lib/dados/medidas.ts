import "server-only";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import type { Contexto } from "@/lib/auth/dal";
import { hojeComoDataSimples } from "@/lib/datas";
import { classificarRisco, ESCALA, NIVEIS_RISCO, type NivelRisco } from "@/lib/risco";
import { POR_PAGINA, STATUS_EM_ABERTO, whereSituacoes, type FiltrosSituacoes } from "@/app/(controle)/medidas/filtros";
import { acaoVencida, dataIso, percentualExecutado, STATUS_ABERTOS } from "./acoes";

export function numeroSituacao(numero: number, ano: number) {
  return `${String(numero).padStart(3, "0")}/${ano}`;
}

/** Lista filtrada e paginada + indicadores do painel de Medidas (sempre sobre as situações em aberto). */
export async function listarSituacoes(ctx: Contexto, filtros: FiltrosSituacoes) {
  const where = whereSituacoes(filtros);
  const hojeData = hojeComoDataSimples();
  const hoje = dataIso(hojeData);

  const [unidades, total, situacoes, emAberto, acoesVencidas] = await comCliente(ctx, (tx) =>
    Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
      tx.situacao.count({ where }),
      tx.situacao.findMany({
        where,
        orderBy: [{ ano: "desc" }, { numero: "desc" }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          numero: true,
          ano: true,
          titulo: true,
          origem: true,
          probabilidade: true,
          impacto: true,
          status: true,
          sigilosa: true,
          unidade: { select: { nome: true, sigla: true } },
          plano: { select: { id: true, acoes: { select: { status: true, prazo: true } } } },
          _count: { select: { documentos: true } },
        },
      }),
      tx.situacao.findMany({ where: { status: { in: STATUS_EM_ABERTO } }, select: { probabilidade: true, impacto: true } }),
      tx.acao.count({
        where: { plano: { situacaoId: { not: null } }, status: { in: STATUS_ABERTOS }, prazo: { lt: hojeData } },
      }),
    ]),
  );

  const porNivel = Object.fromEntries(NIVEIS_RISCO.map((n) => [n, 0])) as Record<NivelRisco, number>;
  // matriz[probabilidade - 1][impacto - 1] = quantidade de situações em aberto
  const matriz = ESCALA.map(() => ESCALA.map(() => 0));
  for (const s of emAberto) {
    porNivel[classificarRisco(s.probabilidade, s.impacto)]++;
    matriz[s.probabilidade - 1][s.impacto - 1]++;
  }

  return {
    unidades,
    total,
    situacoes: situacoes.map(({ plano, ...s }) => ({
      ...s,
      nivel: classificarRisco(s.probabilidade, s.impacto),
      planoId: plano?.id ?? null,
      acoesVencidas: plano ? plano.acoes.filter((a) => acaoVencida(a, hoje)).length : 0,
    })),
    painel: { emAberto: emAberto.length, porNivel, matriz, acoesVencidas },
  };
}

export async function carregarSituacao(ctx: Contexto, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const dados = await comCliente(ctx, async (tx) => {
    const situacao = await tx.situacao.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        ano: true,
        titulo: true,
        descricao: true,
        origem: true,
        unidadeId: true,
        probabilidade: true,
        impacto: true,
        status: true,
        sigilosa: true,
        denunciante: true,
        criadoPorId: true,
        criadoEm: true,
        encerradoPorId: true,
        encerradoEm: true,
        justificativaEncerramento: true,
        unidade: { select: { nome: true, sigla: true } },
        plano: {
          select: { id: true, titulo: true, status: true, acoes: { select: { status: true, percentual: true, prazo: true } } },
        },
        documentos: { orderBy: { criadoEm: "asc" }, select: { id: true, nome: true, tamanho: true, mimeType: true } },
      },
    });
    if (!situacao) return null;
    const [unidades, logs] = await Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
      tx.logAuditoria.findMany({
        where: { OR: [{ entidade: "Situacao", entidadeId: id }, { dados: { path: ["situacaoId"], equals: id } }] },
        orderBy: { criadoEm: "desc" },
        take: 100,
        select: { id: true, acao: true, usuarioId: true, criadoEm: true, dados: true },
      }),
    ]);
    return { situacao, unidades, logs };
  });
  if (!dados) return null;
  const { situacao, unidades, logs } = dados;

  const idsUsuarios = [situacao.criadoPorId, situacao.encerradoPorId, ...logs.map((l) => l.usuarioId)].filter(
    (v): v is string => !!v,
  );
  const usuarios = await db.usuario.findMany({ where: { id: { in: [...new Set(idsUsuarios)] } }, select: { id: true, nome: true } });
  const nomes = new Map(usuarios.map((u) => [u.id, u.nome]));
  const hoje = dataIso(hojeComoDataSimples());
  // Denúncia sigilosa: a identidade do denunciante só chega ao controlador.
  const ocultarDenunciante = situacao.sigilosa && ctx.perfil !== "CONTROLADOR";

  const { plano, criadoPorId, encerradoPorId, denunciante, ...resto } = situacao;
  return {
    situacao: {
      ...resto,
      denunciante: ocultarDenunciante ? null : denunciante,
      denuncianteOculto: ocultarDenunciante && !!denunciante,
      nivel: classificarRisco(situacao.probabilidade, situacao.impacto),
      criadoPor: nomes.get(criadoPorId) ?? null,
      encerradoPor: encerradoPorId ? (nomes.get(encerradoPorId) ?? null) : null,
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
    historico: logs.map((l) => ({
      id: String(l.id),
      acao: l.acao,
      usuario: l.usuarioId ? (nomes.get(l.usuarioId) ?? null) : null,
      criadoEm: l.criadoEm,
      dados: l.dados,
    })),
  };
}

export type SituacaoView = NonNullable<Awaited<ReturnType<typeof carregarSituacao>>>["situacao"];
