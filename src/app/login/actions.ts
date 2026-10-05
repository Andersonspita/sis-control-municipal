"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import { conferirSenha, conferirSenhaFicticia } from "@/lib/auth/senha";
import { criarSessao } from "@/lib/auth/sessao";
import { contarVinculosNoMunicipio, resolverMunicipioAcesso } from "@/lib/auth/municipio";
import { registrarLog, registrarLogGlobal } from "@/lib/auditoria";
import { excedeuLimite, limparTentativas, registrarTentativa } from "@/lib/limite";

const esquema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email({ error: "Informe um e-mail válido." })),
  senha: z.string().min(1, { error: "Informe a senha." }).max(200),
  voltar: z.string().optional(),
  municipio: z.string().max(80).optional(),
});

const CREDENCIAIS_INVALIDAS = "E-mail ou senha inválidos.";

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

  // Entrada pelo link do município (/m/<slug>): a página já respondeu 404 para slug inválido.
  const municipio = dados.data.municipio ? await resolverMunicipioAcesso(dados.data.municipio) : null;
  if (dados.data.municipio && !municipio) {
    registrarTentativa(chave, JANELA_MS);
    return { erro: CREDENCIAIS_INVALIDAS, email };
  }

  const usuario = await db.usuario.findUnique({
    where: { email },
    select: { id: true, senhaHash: true, ativo: true, adminHorizon: true },
  });
  const ok = usuario?.ativo
    ? await conferirSenha(usuario.senhaHash, senha)
    : await conferirSenhaFicticia(senha);

  if (!usuario || !ok) {
    registrarTentativa(chave, JANELA_MS);
    await registrarLogGlobal({
      acao: "login.falha",
      usuarioId: usuario?.id ?? null,
      dados: { email, ...(municipio && { municipio: municipio.slug }) },
    });
    return { erro: CREDENCIAIS_INVALIDAS, email };
  }

  // Sem vínculo no município: mesma resposta de credenciais inválidas, para não revelar a conta.
  if (municipio && !usuario.adminHorizon && (await contarVinculosNoMunicipio(usuario.id, municipio.id)) === 0) {
    registrarTentativa(chave, JANELA_MS);
    await registrarLogGlobal({
      acao: "login.bloqueado_municipio",
      usuarioId: usuario.id,
      dados: { email, municipio: municipio.slug },
    });
    return { erro: CREDENCIAIS_INVALIDAS, email };
  }

  limparTentativas(chave);
  const vinculos = await db.vinculoCliente.findMany({
    where: { usuarioId: usuario.id, ativo: true, cliente: { ativo: true, ...(municipio && { municipioId: municipio.id }) } },
    select: { clienteId: true, perfil: true },
    take: 2,
  });
  const unico = vinculos.length === 1 ? vinculos[0] : null;
  await criarSessao(usuario.id, unico?.clienteId ?? null, municipio?.id ?? null);
  await db.usuario.update({ where: { id: usuario.id }, data: { ultimoAcessoEm: new Date() } });
  await registrarLogGlobal({
    acao: "login.sucesso",
    usuarioId: usuario.id,
    ...(municipio && { dados: { municipio: municipio.slug } }),
  });
  if (unico) {
    await comCliente({ clienteId: unico.clienteId, usuarioId: usuario.id, perfil: unico.perfil }, (tx) =>
      registrarLog(tx, unico.clienteId, { acao: "cliente.selecionado", usuarioId: usuario.id }),
    );
  }

  redirect(destinoSeguro(voltar));
}
