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
    select: { id: true, numero: true, ano: true, status: true, prazo: true },
  });
}
