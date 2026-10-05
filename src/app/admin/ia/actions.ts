"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { comAdmin, exigirAdmin } from "@/lib/admin";
import { registrarLogGlobal } from "@/lib/auditoria";
import { cifrar, criptografiaDisponivel, decifrar } from "@/lib/cripto";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import { CONTEXTO_CHAVE_OPENAI, testarChaveOpenAI } from "@/lib/ia/config";
import type { EstadoAcao } from "@/lib/acoes";

const SEM_CRIPTOGRAFIA = "A variável CHAVE_CRIPTOGRAFIA não está configurada no servidor; nada foi salvo.";

const modelo = (rotulo: string) =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,99}$/, { error: `Informe um ${rotulo} válido (ex.: gpt-4.1-mini).` });

const esquemaChave = z
  .string()
  .trim()
  .refine((v) => v === "" || /^sk-[A-Za-z0-9_-]{16,}$/.test(v), {
    error: "A chave da OpenAI começa com “sk-” e não tem espaços.",
  });

const esquemaConfig = z.object({
  chave: esquemaChave,
  modeloTexto: modelo("modelo de texto"),
  modeloEmbeddings: modelo("modelo de embeddings"),
  limiteMensalUsd: z
    .string()
    .trim()
    .transform((v) => (v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v))
    .refine((v) => v === "" || (/^\d{1,9}(\.\d{1,2})?$/.test(v) && Number(v) > 0), {
      error: "Informe o limite em dólares, com até 2 casas decimais (ex.: 50,00), ou deixe em branco.",
    })
    .transform((v) => (v ? v : null)),
  habilitada: z.literal("on").optional().transform(Boolean),
});

export async function salvarConfigIA(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  if (!criptografiaDisponivel()) return { erro: SEM_CRIPTOGRAFIA };
  const dados = esquemaConfig.safeParse({
    chave: formData.get("chave") ?? "",
    modeloTexto: formData.get("modeloTexto") ?? "",
    modeloEmbeddings: formData.get("modeloEmbeddings") ?? "",
    limiteMensalUsd: formData.get("limiteMensalUsd") ?? "",
    habilitada: formData.get("habilitada") ?? undefined,
  });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { chave, ...config } = dados.data;

  try {
    const final = await comAdmin(sessao.usuario.id, async (tx) => {
      const atual = await tx.configuracaoIA.findUnique({ where: { id: 1 }, select: { chaveFinal: true } });
      const novaChave = chave ? { chaveCifrada: cifrar(chave, CONTEXTO_CHAVE_OPENAI), chaveFinal: chave.slice(-4) } : {};
      const temChave = Boolean(chave || atual?.chaveFinal || process.env.OPENAI_API_KEY?.trim());
      if (config.habilitada && !temChave) throw new ErroNegocio("Informe a chave da API para habilitar a IA.");
      const gravado = await tx.configuracaoIA.upsert({
        where: { id: 1 },
        create: { id: 1, ...config, ...novaChave, alteradoPorId: sessao.usuario.id },
        update: { ...config, ...novaChave, alteradoPorId: sessao.usuario.id },
        select: { chaveFinal: true },
      });
      return gravado.chaveFinal;
    });
    await registrarLogGlobal({
      acao: "admin.ia.configurada",
      usuarioId: sessao.usuario.id,
      entidade: "ConfiguracaoIA",
      entidadeId: "1",
      dados: { ...config, chaveAlterada: Boolean(chave), chaveFinal: final },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin/ia");
  return { ok: true, mensagem: chave ? "Configuração e nova chave salvas." : "Configuração salva." };
}

export async function removerChaveIA(): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  try {
    const final = await comAdmin(sessao.usuario.id, async (tx) => {
      const atual = await tx.configuracaoIA.findUnique({ where: { id: 1 }, select: { chaveFinal: true } });
      if (!atual?.chaveFinal) throw new ErroNegocio("Não há chave cadastrada.");
      await tx.configuracaoIA.update({
        where: { id: 1 },
        data: { chaveCifrada: null, chaveFinal: null, habilitada: false, alteradoPorId: sessao.usuario.id },
      });
      return atual.chaveFinal;
    });
    await registrarLogGlobal({
      acao: "admin.ia.chave_removida",
      usuarioId: sessao.usuario.id,
      entidade: "ConfiguracaoIA",
      entidadeId: "1",
      dados: { chaveFinal: final },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin/ia");
  return { ok: true, mensagem: "Chave removida e IA desabilitada." };
}

export type EstadoTeste = { ok: boolean; mensagem: string; aviso?: string };

/** Testa a chave digitada (ainda não salva) ou, sem ela, a chave em uso. Não grava nada além do log. */
export async function testarConexaoIA(formData: FormData): Promise<EstadoTeste> {
  const sessao = await exigirAdmin();
  const digitada = esquemaChave.safeParse(formData.get("chave") ?? "");
  if (!digitada.success) return { ok: false, mensagem: digitada.error.issues[0]?.message ?? "Chave inválida." };

  let chave = digitada.data;
  let origem = "digitada";
  try {
    if (!chave) {
      const salva = await comAdmin(sessao.usuario.id, (tx) =>
        tx.configuracaoIA.findUnique({ where: { id: 1 }, select: { chaveCifrada: true } }),
      );
      if (salva?.chaveCifrada) {
        chave = decifrar(salva.chaveCifrada, CONTEXTO_CHAVE_OPENAI);
        origem = "salva";
      } else if (process.env.OPENAI_API_KEY?.trim()) {
        chave = process.env.OPENAI_API_KEY.trim();
        origem = "ambiente";
      } else {
        return { ok: false, mensagem: "Nenhuma chave cadastrada. Digite uma chave para testar." };
      }
    }
  } catch (err) {
    return { ok: false, mensagem: mensagemDeErro(err) };
  }

  const resultado = await testarChaveOpenAI(chave);
  await registrarLogGlobal({
    acao: "admin.ia.testada",
    usuarioId: sessao.usuario.id,
    entidade: "ConfiguracaoIA",
    entidadeId: "1",
    dados: { origem, chaveFinal: chave.slice(-4), ok: resultado.ok, status: resultado.status },
  });

  if (!resultado.ok) return { ok: false, mensagem: resultado.mensagem };
  const ausentes = [formData.get("modeloTexto"), formData.get("modeloEmbeddings")].filter(
    (m): m is string => typeof m === "string" && m.trim() !== "" && !resultado.modelos?.includes(m.trim()),
  );
  return {
    ok: true,
    mensagem: `${resultado.mensagem} Chave ${origem === "digitada" ? "digitada (ainda não salva)" : origem === "salva" ? "cadastrada" : "do ambiente"}.`,
    aviso: ausentes.length
      ? `Modelo(s) não disponível(is) para esta chave: ${ausentes.map((m) => m.trim()).join(", ")}.`
      : undefined,
  };
}
