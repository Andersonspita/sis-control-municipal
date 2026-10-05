import type { Prisma, Prioridade, StatusDemanda } from "@/generated/prisma/client";
import { STATUS_ABERTOS, STATUS_FINAIS } from "@/lib/demandas";
import { PRIORIDADE, STATUS_DEMANDA } from "@/lib/rotulos";

export const POR_PAGINA = 50;

export const CLASSE_SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Parametros = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function filtrosDemandas(p: Parametros) {
  const situacao = texto(p.situacao);
  const prioridade = texto(p.prioridade);
  const unidade = texto(p.unidade);
  const pagina = Number.parseInt(texto(p.pagina), 10);
  return {
    situacao:
      situacao === "ABERTAS" || Object.hasOwn(STATUS_DEMANDA, situacao) ? (situacao as StatusDemanda | "ABERTAS") : ("" as const),
    prioridade: Object.hasOwn(PRIORIDADE, prioridade) ? (prioridade as Prioridade) : ("" as const),
    unidade: UUID.test(unidade) ? unidade : "",
    vencidas: texto(p.vencidas) === "1",
    busca: texto(p.busca).slice(0, 100),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export type FiltrosDemandas = ReturnType<typeof filtrosDemandas>;

export function whereDemandas(f: FiltrosDemandas, hoje: Date): Prisma.DemandaWhereInput {
  const e: Prisma.DemandaWhereInput[] = [];
  if (f.situacao === "ABERTAS") e.push({ status: { in: STATUS_ABERTOS } });
  else if (f.situacao) e.push({ status: f.situacao });
  if (f.vencidas) e.push({ status: { notIn: STATUS_FINAIS }, prazo: { lt: hoje } });
  if (f.unidade) e.push({ unidadeDestinoId: f.unidade });
  if (f.prioridade) e.push({ prioridade: f.prioridade });
  if (f.busca) {
    const num = /^(\d{1,6})(?:\/(\d{4}))?$/.exec(f.busca);
    e.push({
      OR: [
        { assunto: { contains: f.busca, mode: "insensitive" } },
        ...(num ? [{ numero: Number(num[1]), ...(num[2] && { ano: Number(num[2]) }) }] : []),
      ],
    });
  }
  return e.length ? { AND: e } : {};
}
