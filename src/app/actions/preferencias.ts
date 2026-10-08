"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario } from "@/lib/auth/dal";
import { gravarPreferencia } from "@/lib/preferencias";
import { esquemaListaIds, paginaValida } from "@/lib/preferencias-esquema";
import { BLOCOS_PAINEL } from "@/lib/painel/blocos";
import { mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";

/** Salva quais blocos da página estão recolhidos (chamado a cada clique; sem revalidar a página). */
export async function salvarRecolhidos(pagina: unknown, ids: unknown): Promise<EstadoAcao> {
  const sessao = await exigirUsuario();
  const lista = esquemaListaIds.safeParse(ids);
  if (!paginaValida(pagina) || !lista.success) return { erro: "Preferência inválida." };
  try {
    await gravarPreferencia(sessao.usuario.id, pagina, "recolhidos", lista.data);
    return { ok: true };
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
}

/** Salva os blocos que o usuário quer ver no painel inicial. */
export async function salvarBlocosPainel(visiveis: unknown): Promise<EstadoAcao> {
  const sessao = await exigirUsuario();
  const lista = esquemaListaIds.safeParse(visiveis);
  if (!lista.success) return { erro: "Seleção inválida." };
  if (!lista.data.length) return { erro: "Escolha ao menos um bloco para o painel." };
  const ocultos = BLOCOS_PAINEL.map((b) => b.id).filter((id) => !lista.data.includes(id));
  try {
    await gravarPreferencia(sessao.usuario.id, "painel", "ocultos", ocultos);
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/painel");
  return { ok: true, mensagem: "Painel atualizado." };
}
