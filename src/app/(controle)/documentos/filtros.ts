import type { Prisma } from "@/generated/prisma/client";

export const ORIGENS = {
  demanda: "Demanda",
  requisito: "Requisito (autoavaliação)",
  acao: "Ação de plano",
  situacao: "Alerta",
  avulso: "Envio avulso",
} as const;

export type Origem = keyof typeof ORIGENS;

export const POR_PAGINA = 50;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function texto(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

export function filtrosDocumentos(p: Record<string, string | string[] | undefined>) {
  const origem = texto(p.origem);
  const unidade = texto(p.unidade);
  const pagina = Number.parseInt(texto(p.pagina), 10);
  return {
    origem: Object.hasOwn(ORIGENS, origem) ? (origem as Origem) : ("" as const),
    unidade: UUID.test(unidade) ? unidade : "",
    busca: texto(p.busca).slice(0, 100),
    pagina: Number.isFinite(pagina) && pagina > 0 ? pagina : 1,
  };
}

export function whereDocumentos(f: ReturnType<typeof filtrosDocumentos>): Prisma.DocumentoWhereInput {
  const e: Prisma.DocumentoWhereInput[] = [];
  if (f.origem === "demanda") e.push({ demandaId: { not: null } });
  if (f.origem === "requisito") e.push({ respostaRequisitoId: { not: null } });
  if (f.origem === "acao") e.push({ acaoId: { not: null } });
  if (f.origem === "situacao") e.push({ situacaoId: { not: null } });
  if (f.origem === "avulso") e.push({ demandaId: null, respostaRequisitoId: null, acaoId: null, situacaoId: null });
  if (f.unidade) {
    e.push({
      OR: [
        { demanda: { unidadeDestinoId: f.unidade } },
        { acao: { unidadeResponsavelId: f.unidade } },
        { situacao: { unidadeId: f.unidade } },
      ],
    });
  }
  if (f.busca) e.push({ nome: { contains: f.busca, mode: "insensitive" } });
  return e.length ? { AND: e } : {};
}
