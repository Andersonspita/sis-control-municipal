import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { slugMunicipioValido } from "@/lib/municipios";

/**
 * Único ponto que resolve o município de acesso. Hoje o slug vem do caminho (/m/<slug>);
 * para atender por subdomínio, basta extrair o slug do host e chamar esta mesma função.
 * Retorna null para slug inexistente ou município inativo.
 */
export const resolverMunicipioAcesso = cache(async (slug: string) => {
  const s = slug.trim().toLowerCase();
  if (!slugMunicipioValido(s)) return null;
  const municipio = await db.municipio.findUnique({
    where: { slug: s },
    select: { id: true, slug: true, nome: true, uf: true, ativo: true },
  });
  if (!municipio?.ativo) return null;
  const { id, nome, uf } = municipio;
  return { id, slug: municipio.slug, nome, uf };
});

export type MunicipioAcesso = NonNullable<Awaited<ReturnType<typeof resolverMunicipioAcesso>>>;

/** Órgãos ativos do município, para a tela de entrada (só dados públicos). */
export async function listarOrgaosMunicipio(municipioId: string) {
  return db.cliente.findMany({
    where: { municipioId, ativo: true },
    select: { id: true, nome: true, tipo: true, tema: true, brasaoKey: true },
    orderBy: [{ tipo: "asc" }, { nome: "asc" }],
  });
}

/** Quantos vínculos ativos, em clientes ativos, o usuário tem no município. */
export function contarVinculosNoMunicipio(usuarioId: string, municipioId: string) {
  return db.vinculoCliente.count({
    where: { usuarioId, ativo: true, cliente: { ativo: true, municipioId } },
  });
}
