"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import { conferirSenha, conferirSenhaFicticia } from "@/lib/auth/senha";
import { criarSessao } from "@/lib/auth/sessao";
import { registrarLog, registrarLogGlobal } from "@/lib/auditoria";
import { excedeuLimite, limparTentativas, registrarTentativa } from "@/lib/limite";

const esquema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Informe um e-mail válido." })),
  senha: z.string().min(1, { error: "Informe a senha." }).max(200),
  voltar: z.string().optional(),
});

export type EstadoLogin = { erro?: string; email?: string } | undefined;

const MAX_TENTATIVAS = 5;
const JANELA_MS = 15 * 60 * 1000;

function destinoSeguro(voltar: string | undefined) {
  return voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : "/";
}

export async function entrar(_estado: EstadoLogin, formData: FormData): Promise<EstadoLogin> {
  const dados = esquema.safeParse(Object.fromEntries(formData));
  if (!dados.success) {
    return { erro: dados.error.issues[0]?.message, email: String(formData.get("email") ?? "") };
  }
  const { email, senha, voltar } = dados.data;
  const chave = `login:${email}`;

  if (excedeuLimite(chave, MAX_TENTATIVAS)) {
    return { erro: "Muitas tentativas. Aguarde alguns minutos e tente novamente.", email };
  }

  const usuario = await db.usuario.findUnique({
    where: { email },
    select: { id: true, senhaHash: true, ativo: true },
  });
  const ok = usuario?.ativo
    ? await conferirSenha(usuario.senhaHash, senha)
    : await conferirSenhaFicticia(senha);

  if (!usuario || !ok) {
    registrarTentativa(chave, JANELA_MS);
    await registrarLogGlobal({ acao: "login.falha", usuarioId: usuario?.id ?? null, dados: { email } });
    return { erro: "E-mail ou senha inválidos.", email };
  }

  limparTentativas(chave);
  const vinculos = await db.vinculoCliente.findMany({
    where: { usuarioId: usuario.id, ativo: true, cliente: { ativo: true } },
    select: { clienteId: true, perfil: true },
    take: 2,
  });
  const unico = vinculos.length === 1 ? vinculos[0] : null;
  await criarSessao(usuario.id, unico?.clienteId ?? null);
  await db.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } });
  await registrarLogGlobal({ acao: "login.sucesso", usuarioId: usuario.id });
  if (unico) {
    await comCliente({ clienteId: unico.clienteId, usuarioId: usuario.id, perfil: unico.perfil }, (tx) =>
      registrarLog(tx, unico.clienteId, { acao: "cliente.selecionado", usuarioId: usuario.id }),
    );
  }

  redirect(destinoSeguro(voltar));
}
