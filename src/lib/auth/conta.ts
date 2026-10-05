import "server-only";
import { z } from "zod";
import { comCliente, db, type ContextoCliente } from "@/lib/db";
import { registrarLog, registrarLogGlobal } from "@/lib/auditoria";
import { cpfValido, somenteDigitos } from "@/lib/documentos-br";
import { excedeuLimite, limparTentativas, registrarTentativa } from "@/lib/limite";
import { conferirSenha, gerarHashSenha } from "./senha";

// Autoatendimento do usuário logado (Configurações › Minha conta): senha, perfil e e-mail.
// Sem dependência de cookies/cabeçalhos: as server actions passam a sessão; os testes chamam direto.

export const MAX_TENTATIVAS_SENHA = 5;
export const JANELA_TENTATIVAS_MS = 15 * 60 * 1000;

export type ResultadoConta = { ok: true; mensagem: string } | { ok: false; erro: string };

const falha = (erro: string): ResultadoConta => ({ ok: false, erro });

const senhaNova = z
  .string()
  .min(10, { error: "A nova senha deve ter ao menos 10 caracteres." })
  .max(128, { error: "A nova senha deve ter no máximo 128 caracteres." });
const senhaAtual = z.string().min(1, { error: "Informe a senha atual." }).max(200);

const esquemaSenha = z
  .object({ senhaAtual, novaSenha: senhaNova, confirmacao: z.string() })
  .refine((d) => d.novaSenha === d.confirmacao, { error: "A confirmação não confere com a nova senha." })
  .refine((d) => d.novaSenha !== d.senhaAtual, { error: "A nova senha deve ser diferente da atual." });

/**
 * Confere a senha atual com limite contra força bruta: após 5 erros em 15 minutos, recusa novas tentativas
 * (limitador em memória do processo, o mesmo do login). Cada erro fica na trilha global.
 */
async function conferirSenhaAtual(usuarioId: string, senha: string, contexto: string): Promise<string | null> {
  const chave = `conta-senha:${usuarioId}`;
  if (excedeuLimite(chave, MAX_TENTATIVAS_SENHA)) {
    return "Muitas tentativas com a senha atual incorreta. Aguarde 15 minutos e tente novamente.";
  }
  const usuario = await db.usuario.findUnique({ where: { id: usuarioId }, select: { senhaHash: true, ativo: true } });
  if (!usuario?.ativo) return "Usuário inativo ou inexistente.";
  if (!(await conferirSenha(usuario.senhaHash, senha))) {
    registrarTentativa(chave, JANELA_TENTATIVAS_MS);
    await registrarLogGlobal({ acao: "usuario.senha_incorreta", usuarioId, entidade: "Usuario", entidadeId: usuarioId, dados: { contexto } });
    return "Senha atual incorreta.";
  }
  limparTentativas(chave);
  return null;
}

/** Troca a própria senha e encerra as demais sessões do usuário, mantendo a atual. */
export async function alterarSenhaPropria(entrada: {
  usuarioId: string;
  sessaoAtualId: string;
  senhaAtual: unknown;
  novaSenha: unknown;
  confirmacao: unknown;
}): Promise<ResultadoConta> {
  const dados = esquemaSenha.safeParse(entrada);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");
  const recusa = await conferirSenhaAtual(entrada.usuarioId, dados.data.senhaAtual, "troca_senha");
  if (recusa) return falha(recusa);

  const senhaHash = await gerarHashSenha(dados.data.novaSenha);
  const encerradas = await db.$transaction(async (tx) => {
    await tx.usuario.update({ where: { id: entrada.usuarioId }, data: { senhaHash } });
    const { count } = await tx.sessao.deleteMany({ where: { usuarioId: entrada.usuarioId, id: { not: entrada.sessaoAtualId } } });
    return count;
  });
  await registrarLogGlobal({
    acao: "usuario.senha_alterada",
    usuarioId: entrada.usuarioId,
    entidade: "Usuario",
    entidadeId: entrada.usuarioId,
    dados: { sessoesEncerradas: encerradas },
  });
  return {
    ok: true,
    mensagem: encerradas
      ? `Senha alterada. ${encerradas === 1 ? "1 outra sessão foi encerrada" : `${encerradas} outras sessões foram encerradas`}.`
      : "Senha alterada.",
  };
}

const esquemaPerfil = z.object({
  nome: z.string().trim().min(3, { error: "Informe o nome completo." }).max(200, { error: "O nome deve ter no máximo 200 caracteres." }),
  cpf: z
    .string()
    .optional()
    .transform((v) => somenteDigitos(v ?? "") || null)
    .refine((v) => v === null || cpfValido(v), { error: "CPF inválido." }),
  telefone: z
    .string()
    .optional()
    .transform((v) => somenteDigitos(v ?? "") || null)
    .refine((v) => v === null || /^[1-9]{2}9?\d{8}$/.test(v), { error: "Informe o telefone com DDD (10 ou 11 dígitos)." }),
  cargo: z
    .string()
    .trim()
    .max(120, { error: "O cargo deve ter no máximo 120 caracteres." })
    .optional()
    .transform((v) => v || null),
});

/**
 * Atualiza nome, CPF, telefone e, havendo cliente ativo, o cargo do próprio vínculo.
 * Campos como e-mail, perfil de acesso e admin_horizon são ignorados aqui (e-mail tem fluxo próprio;
 * os demais só em /admin).
 */
export async function atualizarPerfilProprio(
  usuarioId: string,
  campos: Record<string, unknown>,
  contexto: (ContextoCliente & { vinculoId: string }) | null,
): Promise<ResultadoConta> {
  const dados = esquemaPerfil.safeParse(campos);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");
  const { cargo, ...pessoais } = dados.data;

  const atual = await db.usuario.findUnique({ where: { id: usuarioId }, select: { nome: true, cpf: true, telefone: true } });
  if (!atual) return falha("Usuário inexistente.");
  if (pessoais.cpf && pessoais.cpf !== atual.cpf) {
    const outro = await db.usuario.findFirst({ where: { cpf: pessoais.cpf, id: { not: usuarioId } }, select: { id: true } });
    if (outro) return falha("Este CPF já está cadastrado para outro usuário.");
  }
  const alterados = (Object.keys(pessoais) as (keyof typeof pessoais)[]).filter((k) => pessoais[k] !== atual[k]);

  try {
    if (alterados.length) await db.usuario.update({ where: { id: usuarioId }, data: pessoais });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") return falha("Este CPF já está cadastrado para outro usuário.");
    throw err;
  }

  let cargoAlterado = false;
  if (contexto && "cargo" in campos) {
    cargoAlterado = await comCliente(contexto, async (tx) => {
      const vinculo = await tx.vinculoCliente.findFirst({ where: { id: contexto.vinculoId, usuarioId }, select: { cargo: true } });
      if (!vinculo || vinculo.cargo === cargo) return false;
      await tx.vinculoCliente.update({ where: { id: contexto.vinculoId }, data: { cargo } });
      await registrarLog(tx, contexto.clienteId, {
        acao: "usuario.cargo_alterado",
        usuarioId,
        entidade: "VinculoCliente",
        entidadeId: contexto.vinculoId,
        dados: { de: vinculo.cargo, para: cargo },
      });
      return true;
    });
  }

  if (!alterados.length && !cargoAlterado) return { ok: true, mensagem: "Nenhuma alteração para salvar." };
  if (alterados.length) {
    await registrarLogGlobal({
      acao: "usuario.perfil_atualizado",
      usuarioId,
      entidade: "Usuario",
      entidadeId: usuarioId,
      dados: { campos: alterados, ...(alterados.includes("nome") && { nome: pessoais.nome }), cargoAlterado },
    });
  }
  return { ok: true, mensagem: "Perfil atualizado." };
}

const esquemaEmail = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email({ error: "Informe um e-mail válido." })),
  senhaAtual,
});

/** Troca o e-mail de login, confirmada pela senha atual. */
export async function alterarEmailProprio(usuarioId: string, campos: Record<string, unknown>): Promise<ResultadoConta> {
  const dados = esquemaEmail.safeParse(campos);
  if (!dados.success) return falha(dados.error.issues[0]?.message ?? "Dados inválidos.");
  const { email } = dados.data;

  const atual = await db.usuario.findUnique({ where: { id: usuarioId }, select: { email: true } });
  if (!atual) return falha("Usuário inexistente.");
  if (atual.email === email) return falha("O novo e-mail é igual ao atual.");
  const recusa = await conferirSenhaAtual(usuarioId, dados.data.senhaAtual, "troca_email");
  if (recusa) return falha(recusa);

  const ocupado = await db.usuario.findUnique({ where: { email }, select: { id: true } });
  if (ocupado) return falha("Este e-mail já é usado por outro usuário.");
  try {
    await db.usuario.update({ where: { id: usuarioId }, data: { email } });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "P2002") return falha("Este e-mail já é usado por outro usuário.");
    throw err;
  }
  await registrarLogGlobal({
    acao: "usuario.email_alterado",
    usuarioId,
    entidade: "Usuario",
    entidadeId: usuarioId,
    dados: { emailAnterior: atual.email, emailNovo: email },
  });
  return { ok: true, mensagem: "E-mail alterado. Use o novo e-mail no próximo login." };
}
