"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, comCliente } from "@/lib/db";
import { definirClienteAtivo, encerrarSessao, liberarMunicipioAcesso } from "@/lib/auth/sessao";
import { clientePermitidoNaSessao, exigirUsuario, obterSessao, paginaInicial } from "@/lib/auth/dal";
import { registrarLog, registrarLogGlobal } from "@/lib/auditoria";
import { caminhoAcessoMunicipio } from "@/lib/municipios";

export async function sair() {
  const sessao = await obterSessao();
  if (sessao) await registrarLogGlobal({ acao: "logout", usuarioId: sessao.usuario.id });
  await encerrarSessao();
  // Quem entrou pelo link do município volta para ele.
  const municipio = sessao?.municipioAcesso;
  redirect(municipio?.ativo ? caminhoAcessoMunicipio(municipio.slug) : "/login");
}

/**
 * Sai da restrição de município. O administrador continua logado; os demais precisam entrar
 * de novo pelo /login geral, que não restringe a sessão.
 */
export async function verTodasEntidades() {
  const sessao = await exigirUsuario();
  if (!sessao.municipioAcesso) redirect("/selecionar-cliente");
  if (sessao.usuario.adminHorizon) {
    await liberarMunicipioAcesso();
    redirect("/selecionar-cliente");
  }
  await registrarLogGlobal({ acao: "logout", usuarioId: sessao.usuario.id, dados: { motivo: "ver_todas_entidades" } });
  await encerrarSessao();
  redirect("/login");
}

export async function selecionarCliente(formData: FormData) {
  const sessao = await exigirUsuario();
  const clienteId = z.uuid().parse(formData.get("clienteId"));

  const vinculo = await db.vinculoCliente.findUnique({
    where: { usuarioId_clienteId: { usuarioId: sessao.usuario.id, clienteId } },
    select: { perfil: true, ativo: true, cliente: { select: { ativo: true, municipioId: true } } },
  });
  if (!vinculo?.ativo || !vinculo.cliente.ativo) redirect("/selecionar-cliente");
  if (!clientePermitidoNaSessao(sessao, vinculo.cliente)) {
    await registrarLogGlobal({
      acao: "acesso.municipio.bloqueado",
      usuarioId: sessao.usuario.id,
      entidade: "Cliente",
      entidadeId: clienteId,
      dados: { municipio: sessao.municipioAcesso?.slug, origem: "selecionar-cliente" },
    });
    redirect("/selecionar-cliente");
  }

  await definirClienteAtivo(clienteId);
  await comCliente({ clienteId, usuarioId: sessao.usuario.id, perfil: vinculo.perfil }, (tx) =>
    registrarLog(tx, clienteId, { acao: "cliente.selecionado", usuarioId: sessao.usuario.id }),
  );
  redirect(paginaInicial(vinculo.perfil));
}
