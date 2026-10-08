import type { OrigemSituacao, Prisma, StatusSituacao } from "@/generated/prisma/client";
import { combinacoesDoNivel, NIVEL_RISCO, type NivelRisco } from "@/lib/risco";
import { ORIGEM_SITUACAO, STATUS_SITUACAO } from "@/lib/rotulos";

export const POR_PAGINA = 50;

export const CLASSE_SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Situações que ainda exigem tratamento. */
export const STATUS_EM_ABERTO: StatusSituacao[] = ["ABERTA", "EM_TRATAMENTO"];
export const STATUS_ENCERRADOS: StatusSituacao[] = ["RESOLVIDA", "ARQUIVADA"];

type Parametros = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function filtrosSituacoes(p: Parametros) {
  const status = texto(p.status);
  const gravidade = texto(p.gravidade);
  const origem = texto(p.origem);
  const unidade = texto(p.unidade);
  const pagina = Number.parseInt(texto(p.pagina), 10);
  return {
    status:
      status === "ABERTAS" || Object.hasOwn(STATUS_SITUACAO, status) ? (status as StatusSituacao | "ABERTAS") : ("" as const),
    gravidade: Object.hasOwn(NIVEL_RISCO, gravidade) ? (gravidade as NivelRisco) : ("" as const),
    origem: Object.hasOwn(ORIGEM_SITUACAO, origem) ? (origem as OrigemSituacao) : ("" as const),
    unidade: UUID.test(unidade) ? unidade : "",
    busca: texto(p.busca).slice(0, 100),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export type FiltrosSituacoes = ReturnType<typeof filtrosSituacoes>;

export function whereSituacoes(f: FiltrosSituacoes): Prisma.SituacaoWhereInput {
  const e: Prisma.SituacaoWhereInput[] = [];
  if (f.status === "ABERTAS") e.push({ status: { in: STATUS_EM_ABERTO } });
  else if (f.status) e.push({ status: f.status });
  // A gravidade não é gravada: vira a lista de combinações de probabilidade × impacto do nível.
  if (f.gravidade) e.push({ OR: combinacoesDoNivel(f.gravidade) });
  if (f.origem) e.push({ origem: f.origem });
  if (f.unidade) e.push({ unidadeId: f.unidade });
  if (f.busca) {
    const num = /^(\d{1,6})(?:\/(\d{4}))?$/.exec(f.busca);
    e.push({
      OR: [
        { titulo: { contains: f.busca, mode: "insensitive" } },
        ...(num ? [{ numero: Number(num[1]), ...(num[2] && { ano: Number(num[2]) }) }] : []),
      ],
    });
  }
  return e.length ? { AND: e } : {};
}
