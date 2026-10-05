import "server-only";
import { comCliente, type ContextoCliente, type Tx } from "@/lib/db";
import type { TipoTramite } from "@/generated/prisma/client";

const SELECAO_DOCUMENTO = { id: true, nome: true, tamanho: true, mimeType: true } as const;

/** Demanda com tramitação e anexos. O RLS já remove o que o satélite não pode ver. */
export async function obterDemanda(ctx: ContextoCliente, id: string) {
  return comCliente(ctx, async (tx) => {
    const demanda = await tx.demanda.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        ano: true,
        assunto: true,
        descricao: true,
        prazo: true,
        prioridade: true,
        status: true,
        criadoEm: true,
        criadoPorId: true,
        unidadeDestino: { select: { id: true, nome: true, sigla: true, responsavelNome: true } },
        respostaRequisitoId: true,
        // Para o satélite, a resposta do requisito vem nula (RLS) e a ação só se for da unidade dele.
        respostaRequisito: {
          select: { cicloId: true, ciclo: { select: { nome: true } }, requisito: { select: { id: true, codigo: true, titulo: true } } },
        },
        acao: { select: { id: true, oQue: true, planoId: true, plano: { select: { titulo: true } } } },
        tramites: {
          orderBy: [{ criadoEm: "asc" }, { id: "asc" }],
          select: {
            id: true,
            tipo: true,
            statusAnterior: true,
            statusNovo: true,
            texto: true,
            novoPrazo: true,
            interno: true,
            usuarioNome: true,
            criadoEm: true,
            documentos: { select: SELECAO_DOCUMENTO, orderBy: { criadoEm: "asc" } },
          },
        },
        documentos: { where: { tramiteId: null }, select: SELECAO_DOCUMENTO, orderBy: { criadoEm: "asc" } },
      },
    });
    return demanda;
  });
}

export type DemandaDetalhe = NonNullable<Awaited<ReturnType<typeof obterDemanda>>>;
export type TramiteDetalhe = DemandaDetalhe["tramites"][number];

const TIPOS_PRORROGACAO: TipoTramite[] = ["PRORROGACAO_SOLICITADA", "PRORROGACAO_DEFERIDA", "PRORROGACAO_INDEFERIDA"];

/** Último pedido de prorrogação ainda sem decisão, se houver. */
export function prorrogacaoPendente<T extends { tipo: TipoTramite }>(tramites: T[]): T | null {
  const ultimo = tramites.filter((t) => TIPOS_PRORROGACAO.includes(t.tipo)).at(-1);
  return ultimo?.tipo === "PRORROGACAO_SOLICITADA" ? ultimo : null;
}

/** Versão para uso dentro de uma transação, antes de gravar uma decisão. */
export async function buscarProrrogacaoPendente(tx: Tx, demandaId: string) {
  const ultimo = await tx.tramitacaoDemanda.findFirst({
    where: { demandaId, tipo: { in: TIPOS_PRORROGACAO } },
    orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
    select: { id: true, tipo: true, novoPrazo: true, texto: true },
  });
  return ultimo?.tipo === "PRORROGACAO_SOLICITADA" ? ultimo : null;
}

/** Bloqueia a linha da demanda até o fim da transação (evita duas mudanças de situação simultâneas). */
export async function travarDemanda(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM demandas WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.demanda.findUnique({
    where: { id },
    select: { id: true, numero: true, ano: true, status: true, prazo: true, respostaRequisitoId: true, acaoId: true },
  });
}

type Origem<T> = { ok: true; origem: T } | { ok: false; motivo: string };

function avaliarOrigem<T>(valor: T | null, naoEncontrada: string, impedimento: (v: T) => string | null): Origem<T> {
  if (!valor) return { ok: false, motivo: naoEncontrada };
  const motivo = impedimento(valor);
  return motivo ? { ok: false, motivo } : { ok: true, origem: valor };
}

/** Requisito da autoavaliação que pode originar uma demanda: só enquanto o ciclo está em andamento. */
export async function buscarOrigemRequisito(tx: Tx, respostaRequisitoId: string) {
  const resposta = await tx.respostaRequisito.findUnique({
    where: { id: respostaRequisitoId },
    select: {
      id: true,
      cicloId: true,
      ciclo: { select: { nome: true, status: true } },
      requisito: { select: { id: true, codigo: true, titulo: true, descricao: true, orientacao: true } },
    },
  });
  return avaliarOrigem(resposta, "O requisito de origem não foi encontrado.", (r) =>
    r.ciclo.status === "EM_ANDAMENTO" ? null : "O ciclo de autoavaliação do requisito de origem não está mais em andamento.",
  );
}

/** Ação de plano que pode originar uma demanda: nem ela nem o plano podem estar cancelados. */
export async function buscarOrigemAcao(tx: Tx, acaoId: string) {
  const acao = await tx.acao.findUnique({
    where: { id: acaoId },
    select: {
      id: true,
      oQue: true,
      porQue: true,
      como: true,
      prazo: true,
      prioridade: true,
      status: true,
      unidadeResponsavelId: true,
      planoId: true,
      plano: { select: { titulo: true, status: true } },
    },
  });
  return avaliarOrigem(acao, "A ação de origem não foi encontrada.", (a) =>
    a.status === "CANCELADA" || a.plano.status === "CANCELADO" ? "A ação de origem (ou o plano dela) está cancelada." : null,
  );
}

/**
 * Na conclusão, os documentos enviados pela unidade nas respostas viram evidência da origem
 * (requisito e/ou ação), sem perder o vínculo com a demanda. Origem já encerrada não recebe evidência.
 */
export async function vincularEvidenciasDaResposta(
  tx: Tx,
  demanda: { id: string; respostaRequisitoId: string | null; acaoId: string | null },
) {
  const vinculo: { respostaRequisitoId?: string; acaoId?: string } = {};
  const caminhos: string[] = [];
  const recusas: string[] = [];
  if (demanda.respostaRequisitoId) {
    const r = await buscarOrigemRequisito(tx, demanda.respostaRequisitoId);
    if (r.ok) {
      vinculo.respostaRequisitoId = r.origem.id;
      caminhos.push(`/autoavaliacao/${r.origem.cicloId}`);
    } else recusas.push(r.motivo);
  }
  if (demanda.acaoId) {
    const r = await buscarOrigemAcao(tx, demanda.acaoId);
    if (r.ok) {
      vinculo.acaoId = r.origem.id;
      caminhos.push(`/planos/${r.origem.planoId}`);
    } else recusas.push(r.motivo);
  }
  if (!vinculo.respostaRequisitoId && !vinculo.acaoId) return { quantidade: 0, vinculo, caminhos, recusas };
  const { count } = await tx.documento.updateMany({
    where: { demandaId: demanda.id, tramite: { is: { tipo: "RESPOSTA", interno: false } } },
    data: vinculo,
  });
  return { quantidade: count, vinculo, caminhos, recusas };
}
