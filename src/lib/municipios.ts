/** Mesmo formato da restrição municipios_slug_check do banco. */
export const FORMATO_SLUG_MUNICIPIO = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Slug do link de acesso: nome sem acento, minúsculo, com hífens, mais a UF. Ex.: catolandia-ba.
 * A mesma regra existe no banco (app_slug_municipio), usada quando um cliente é criado sem município.
 */
export function gerarSlugMunicipio(nome: string, uf: string) {
  const base = nome
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base || "municipio"}-${uf.trim().toLowerCase()}`;
}

export function slugMunicipioValido(slug: string) {
  return slug.length >= 3 && slug.length <= 80 && FORMATO_SLUG_MUNICIPIO.test(slug);
}

/** Caminho público de entrada do município. */
export function caminhoAcessoMunicipio(slug: string) {
  return `/m/${slug}`;
}
