import type { Prisma, StatusAuditoria, TipoAuditoria } from "@/generated/prisma/client";
import { STATUS_AUDITORIA_FINAIS } from "@/lib/auditorias";
import { STATUS_AUDITORIA, TIPO_AUDITORIA } from "@/lib/rotulos";

export const POR_PAGINA = 50;

export const CLASSE_SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Parametros = Record<string, string | string[] | undefined>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function filtrosAuditorias(p: Parametros) {
  const status = texto(p.status);
  const tipo = texto(p.tipo);
  const unidade = texto(p.unidade);
  const ano = Number.parseInt(texto(p.ano), 10);
  const pagina = Number.parseInt(texto(p.pagina), 10);
  return {
    status:
      status === "ATIVAS" || Object.hasOwn(STATUS_AUDITORIA, status) ? (status as StatusAuditoria | "ATIVAS") : ("" as const),
    tipo: Object.hasOwn(TIPO_AUDITORIA, tipo) ? (tipo as TipoAuditoria) : ("" as const),
    unidade: UUID.test(unidade) ? unidade : "",
    ano: Number.isInteger(ano) && ano >= 2000 && ano <= 2100 ? ano : ("" as const),
    busca: texto(p.busca).slice(0, 100),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export type FiltrosAuditorias = ReturnType<typeof filtrosAuditorias>;

export function whereAuditorias(f: FiltrosAuditorias): Prisma.AuditoriaWhereInput {
  const e: Prisma.AuditoriaWhereInput[] = [];
  if (f.status === "ATIVAS") e.push({ status: { notIn: [...STATUS_AUDITORIA_FINAIS] } });
  else if (f.status) e.push({ status: f.status });
  if (f.tipo) e.push({ tipo: f.tipo });
  if (f.unidade) e.push({ unidadeId: f.unidade });
  if (f.ano) e.push({ ano: f.ano });
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
