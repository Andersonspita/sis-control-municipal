"use server";

import { revalidatePath } from "next/cache";
import { exigirUsuario, obterContexto } from "@/lib/auth/dal";
import { alterarEmailProprio, alterarSenhaPropria, atualizarPerfilProprio, type ResultadoConta } from "@/lib/auth/conta";
import { mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";

function paraEstado(r: ResultadoConta): EstadoAcao {
  return r.ok ? { ok: true, mensagem: r.mensagem } : { erro: r.erro };
}

export async function alterarMinhaSenha(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirUsuario();
  try {
    return paraEstado(
      await alterarSenhaPropria({
        usuarioId: sessao.usuario.id,
        sessaoAtualId: sessao.id,
        senhaAtual: formData.get("senhaAtual"),
        novaSenha: formData.get("novaSenha"),
        confirmacao: formData.get("confirmacao"),
      }),
    );
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
}

export async function atualizarMeuPerfil(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirUsuario();
  const ctx = await obterContexto();
  const campos: Record<string, unknown> = {
    nome: formData.get("nome") ?? "",
    cpf: formData.get("cpf") ?? "",
    telefone: formData.get("telefone") ?? "",
  };
  if (ctx && formData.has("cargo")) campos.cargo = formData.get("cargo") ?? "";
  try {
    const r = await atualizarPerfilProprio(sessao.usuario.id, campos, ctx);
    // O nome aparece no menu do usuário em todos os layouts.
    if (r.ok) revalidatePath("/", "layout");
    return paraEstado(r);
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
}

export async function alterarMeuEmail(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirUsuario();
  try {
    const r = await alterarEmailProprio(sessao.usuario.id, {
      email: formData.get("email") ?? "",
      senhaAtual: formData.get("senhaAtual") ?? "",
    });
    if (r.ok) revalidatePath("/", "layout");
    return paraEstado(r);
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
}
