import "server-only";
import { db } from "@/lib/db";
import { lerPreferencias, type PaginaPreferencia, type PreferenciaPagina } from "./preferencias-esquema";

/** Preferências de exibição de uma página para o usuário (vazio = padrão: tudo visível e aberto). */
export async function preferenciasDaPagina(usuarioId: string, pagina: PaginaPreferencia): Promise<Required<PreferenciaPagina>> {
  const u = await db.usuario.findUnique({ where: { id: usuarioId }, select: { preferencias: true } });
  const p = lerPreferencias(u?.preferencias)[pagina];
  return { recolhidos: p?.recolhidos ?? [], ocultos: p?.ocultos ?? [] };
}

/**
 * Grava um campo da página numa única instrução SQL, sem ler antes:
 * cliques seguidos (ou em outra aba) não sobrescrevem os demais campos.
 */
export async function gravarPreferencia(
  usuarioId: string,
  pagina: PaginaPreferencia,
  campo: keyof PreferenciaPagina,
  ids: string[],
) {
  const valor = JSON.stringify([...new Set(ids)]);
  await db.$executeRaw`
    UPDATE usuarios
       SET preferencias = preferencias || jsonb_build_object(
             ${pagina}::text,
             COALESCE(preferencias -> ${pagina}::text, '{}'::jsonb) || jsonb_build_object(${campo}::text, ${valor}::jsonb)
           )
     WHERE id = ${usuarioId}::uuid`;
}
