"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db, comCliente } from "@/lib/db";
import { definirClienteAtivo, encerrarSessao } from "@/lib/auth/sessao";
import { exigirUsuario, obterSessao, paginaInicial } from "@/lib/auth/dal";
import { registrarLog, registrarLogGlobal } from "@/lib/auditoria";

export async function sair() {
  const sessao = await obterSessao();
  if (sessao) await registrarLogGlobal({ acao: "logout", usuarioId: sessao.usuario.id });
  await encerrarSessao();
  redirect("/login");
}

export async function selecionarCliente(formData: FormData) {
  const sessao = await exigirUsuario();
  const clienteId = z.uuid().parse(formData.get("clienteId"));

  const vinculo = await db.vinculoCliente.findUnique({
    where: { usuarioId_clienteId: { usuarioId: sessao.usuario.id, clienteId } },
    select: { perfil: true, ativo: true, cliente: { select: { ativo: true } } },
  });
  if (!vinculo?.ativo || !vinculo.cliente.ativo) redirect("/selecionar-cliente");

  await definirClienteAtivo(clienteId);
  await comCliente({ clienteId, usuarioId: sessao.usuario.id, perfil: vinculo.perfil }, (tx) =>
    registrarLog(tx, clienteId, { acao: "cliente.selecionado", usuarioId: sessao.usuario.id }),
  );
  redirect(paginaInicial(vinculo.perfil));
}
