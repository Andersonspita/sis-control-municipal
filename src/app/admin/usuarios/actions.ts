"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { comClienteComoAdmin, exigirAdmin, unidadesEmArvore, violouUnicidade } from "@/lib/admin";
import { db } from "@/lib/db";
import { registrarLogGlobal } from "@/lib/auditoria";
import { gerarHashSenha } from "@/lib/auth/senha";
import { cpfValido, somenteDigitos } from "@/lib/documentos-br";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";

const marcado = z
  .string()
  .optional()
  .transform((v) => v === "on" || v === "true");

const senha = z
  .string()
  .min(10, { error: "A senha deve ter ao menos 10 caracteres." })
  .max(128, { error: "A senha deve ter no máximo 128 caracteres." });

const esquemaUsuario = z.object({
  nome: z.string().trim().min(3, { error: "Informe o nome completo." }).max(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "Informe um e-mail válido." })),
  cpf: z
    .string()
    .optional()
    .transform((v) => somenteDigitos(v ?? "") || null)
    .refine((v) => v === null || cpfValido(v), { error: "CPF inválido." }),
  adminHorizon: marcado,
});

const esquemaCriacao = esquemaUsuario.extend({ senha });

export async function criarUsuario(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaCriacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { senha, ...resto } = dados.data;

  let id: string;
  try {
    const usuario = await db.usuario.create({
      data: { ...resto, senhaHash: await gerarHashSenha(senha) },
      select: { id: true },
    });
    id = usuario.id;
    await registrarLogGlobal({
      acao: "admin.usuario.criado",
      usuarioId: sessao.usuario.id,
      entidade: "Usuario",
      entidadeId: id,
      dados: { nome: resto.nome, email: resto.email, adminHorizon: resto.adminHorizon },
    });
  } catch (err) {
    if (violouUnicidade(err)) return { erro: "Já existe um usuário com este e-mail ou CPF." };
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin/usuarios");
  redirect(`/admin/usuarios/${id}`);
}

export async function editarUsuario(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  const dados = esquemaUsuario.safeParse(Object.fromEntries(formData));
  if (!id.success) return { erro: "Requisição inválida." };
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  if (id.data === sessao.usuario.id && !dados.data.adminHorizon) {
    return { erro: "Você não pode remover a sua própria permissão de administrador." };
  }

  try {
    await db.usuario.update({ where: { id: id.data }, data: dados.data });
    await registrarLogGlobal({
      acao: "admin.usuario.alterado",
      usuarioId: sessao.usuario.id,
      entidade: "Usuario",
      entidadeId: id.data,
      dados: { nome: dados.data.nome, email: dados.data.email, adminHorizon: dados.data.adminHorizon },
    });
  } catch (err) {
    if (violouUnicidade(err)) return { erro: "Já existe um usuário com este e-mail ou CPF." };
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin/usuarios", "layout");
  return { ok: true, mensagem: "Usuário atualizado." };
}

const esquemaSituacao = z.object({
  id: z.uuid(),
  ativo: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function alterarSituacaoUsuario(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaSituacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Requisição inválida." };
  const { id, ativo } = dados.data;
  if (id === sessao.usuario.id && !ativo) return { erro: "Você não pode desativar o seu próprio usuário." };

  try {
    const usuario = await db.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id }, data: { ativo }, select: { email: true } });
      if (!ativo) await tx.sessao.deleteMany({ where: { usuarioId: id } });
      return u;
    });
    await registrarLogGlobal({
      acao: ativo ? "admin.usuario.ativado" : "admin.usuario.desativado",
      usuarioId: sessao.usuario.id,
      entidade: "Usuario",
      entidadeId: id,
      dados: { email: usuario.email },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin/usuarios", "layout");
  return { ok: true, mensagem: ativo ? "Usuário ativado." : "Usuário desativado e sessões encerradas." };
}

const esquemaSenha = z
  .object({ id: z.uuid(), senha, confirmacao: z.string() })
  .refine((d) => d.senha === d.confirmacao, { error: "A confirmação não confere com a nova senha.", path: ["confirmacao"] });

export async function redefinirSenha(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaSenha.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { id } = dados.data;

  try {
    const senhaHash = await gerarHashSenha(dados.data.senha);
    const encerradas = await db.$transaction(async (tx) => {
      const u = await tx.usuario.update({ where: { id }, data: { senhaHash }, select: { id: true } });
      // Encerra as sessões do usuário (preservando a do próprio administrador, se for ele).
      const { count } = await tx.sessao.deleteMany({
        where: { usuarioId: u.id, ...(u.id === sessao.usuario.id && { id: { not: sessao.id } }) },
      });
      return count;
    });
    await registrarLogGlobal({
      acao: "admin.usuario.senha_redefinida",
      usuarioId: sessao.usuario.id,
      entidade: "Usuario",
      entidadeId: id,
      dados: { sessoesEncerradas: encerradas },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath(`/admin/usuarios/${id}`);
  return { ok: true, mensagem: "Senha redefinida e sessões ativas encerradas." };
}

// ───────────────────────── Vínculos ─────────────────────────

export type UnidadeEscopo = { id: string; nome: string; sigla: string | null; nivel: number };

/** Unidades ativas do cliente, para o escopo do satélite. */
export async function listarUnidadesDoCliente(clienteId: string): Promise<UnidadeEscopo[]> {
  const sessao = await exigirAdmin();
  if (!z.uuid().safeParse(clienteId).success) return [];
  return comClienteComoAdmin(sessao.usuario.id, clienteId, unidadesEmArvore);
}

const esquemaVinculo = z.object({
  usuarioId: z.uuid(),
  clienteId: z.uuid({ error: "Selecione o cliente." }),
  perfil: z.enum(["CONTROLADOR", "EQUIPE", "SATELITE"], { error: "Selecione o perfil." }),
  cargo: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((v) => v || null),
  unidadeIds: z.array(z.uuid()).max(200),
});

export async function salvarVinculo(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaVinculo.safeParse({ ...Object.fromEntries(formData), unidadeIds: formData.getAll("unidadeIds") });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { usuarioId, clienteId, perfil, cargo } = dados.data;
  const unidadeIds = perfil === "SATELITE" ? [...new Set(dados.data.unidadeIds)] : [];
  if (perfil === "SATELITE" && unidadeIds.length === 0) {
    return { erro: "Usuário satélite precisa de ao menos uma unidade no escopo." };
  }

  try {
    const cliente = await db.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } });
    if (!cliente) throw new ErroNegocio("Cliente não encontrado.");

    const resultado = await comClienteComoAdmin(sessao.usuario.id, clienteId, async (tx) => {
      const unidades = await tx.unidade.findMany({
        where: { id: { in: unidadeIds }, ativo: true },
        select: { id: true, nome: true },
      });
      if (unidades.length !== unidadeIds.length) throw new ErroNegocio("Há unidades inválidas no escopo. Recarregue a página.");

      const vinculo = await tx.vinculoCliente.upsert({
        where: { usuarioId_clienteId: { usuarioId, clienteId } },
        create: { usuarioId, clienteId, perfil, cargo },
        update: { perfil, cargo },
        select: { id: true },
      });
      await tx.escopoSatelite.deleteMany({ where: { vinculoId: vinculo.id } });
      if (unidadeIds.length) {
        await tx.escopoSatelite.createMany({
          data: unidadeIds.map((unidadeId) => ({ clienteId, vinculoId: vinculo.id, unidadeId })),
        });
      }
      return { vinculoId: vinculo.id, unidades: unidades.map((u) => u.nome) };
    });

    await registrarLogGlobal({
      acao: "admin.vinculo.salvo",
      usuarioId: sessao.usuario.id,
      entidade: "VinculoCliente",
      entidadeId: resultado.vinculoId,
      dados: { usuarioId, clienteId, cliente: cliente.nome, perfil, cargo, unidades: resultado.unidades },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath(`/admin/usuarios/${usuarioId}`);
  return { ok: true, mensagem: "Vínculo salvo." };
}

export async function alterarSituacaoVinculo(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaSituacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Requisição inválida." };
  const { id, ativo } = dados.data;

  let usuarioId: string;
  try {
    const vinculo = await db.vinculoCliente.findUnique({
      where: { id },
      select: { usuarioId: true, clienteId: true, perfil: true, cliente: { select: { nome: true } } },
    });
    if (!vinculo) throw new ErroNegocio("Vínculo não encontrado.");
    usuarioId = vinculo.usuarioId;

    if (ativo && vinculo.perfil === "SATELITE") {
      const escopos = await comClienteComoAdmin(sessao.usuario.id, vinculo.clienteId, (tx) =>
        tx.escopoSatelite.count({ where: { vinculoId: id } }),
      );
      if (!escopos) throw new ErroNegocio("Defina as unidades do escopo (editar vínculo) antes de reativar este satélite.");
    }

    await db.$transaction([
      db.vinculoCliente.update({ where: { id }, data: { ativo } }),
      ...(ativo
        ? []
        : [
            db.sessao.updateMany({
              where: { usuarioId: vinculo.usuarioId, clienteAtivoId: vinculo.clienteId },
              data: { clienteAtivoId: null },
            }),
          ]),
    ]);
    await registrarLogGlobal({
      acao: ativo ? "admin.vinculo.ativado" : "admin.vinculo.desativado",
      usuarioId: sessao.usuario.id,
      entidade: "VinculoCliente",
      entidadeId: id,
      dados: { usuarioId: vinculo.usuarioId, clienteId: vinculo.clienteId, cliente: vinculo.cliente.nome, perfil: vinculo.perfil },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath(`/admin/usuarios/${usuarioId}`);
  return { ok: true, mensagem: ativo ? "Vínculo reativado." : "Vínculo desativado." };
}
