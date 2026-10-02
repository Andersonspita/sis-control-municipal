import { redirect } from "next/navigation";
import { exigirUsuario, listarVinculos, obterContexto, paginaInicial } from "@/lib/auth/dal";

export default async function Inicio() {
  const sessao = await exigirUsuario();
  const ctx = await obterContexto();
  if (ctx) redirect(paginaInicial(ctx.perfil));

  const vinculos = await listarVinculos(sessao.usuario.id);
  if (vinculos.length === 0 && sessao.usuario.adminHorizon) redirect("/admin");
  redirect("/selecionar-cliente");
}
