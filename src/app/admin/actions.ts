"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirAdmin, violouUnicidade } from "@/lib/admin";
import { db } from "@/lib/db";
import { registrarLogGlobal } from "@/lib/auditoria";
import { cnpjValido, normalizarCnpj, UFS } from "@/lib/documentos-br";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import { agendarSincronizacao } from "@/lib/dados/integracoes";
import { mensagemIntegracao } from "@/lib/integracoes/http";
import { listarMunicipios, obterPopulacao } from "@/lib/integracoes/ibge";
import type { EstadoAcao } from "@/lib/acoes";

const esquemaCliente = z.object({
  nome: z.string().trim().min(3, { error: "Informe o nome da entidade." }).max(200),
  tipo: z.enum(["PREFEITURA", "CAMARA", "AUTARQUIA", "FUNDACAO", "CONSORCIO", "EMPRESA_PUBLICA", "OUTRO"], {
    error: "Selecione o tipo da entidade.",
  }),
  cnpj: z
    .string()
    .transform(normalizarCnpj)
    .refine(cnpjValido, { error: "CNPJ inválido." }),
  municipio: z.string().trim().min(2, { error: "Informe o município." }).max(120),
  uf: z.enum(UFS, { error: "Selecione a UF." }),
  codigoIbge: z
    .string()
    .trim()
    .regex(/^(\d{7})?$/, { error: "O código IBGE tem 7 dígitos." })
    .transform((v) => v || null),
  populacao: z
    .string()
    .trim()
    .regex(/^\d{0,9}$/, { error: "Informe a população só com números." })
    .transform((v) => (v ? Number(v) : null)),
});

export async function salvarCliente(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaCliente.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const id = formData.get("id");

  let sincronizar: string | null = null;
  try {
    if (typeof id === "string" && id) {
      const anterior = await db.cliente.findUnique({ where: { id }, select: { id: true, codigoIbge: true } });
      if (!anterior) throw new ErroNegocio("Cliente não encontrado.");
      await db.cliente.update({ where: { id }, data: dados.data });
      if (dados.data.codigoIbge && dados.data.codigoIbge !== anterior.codigoIbge) sincronizar = id;
      await registrarLogGlobal({
        acao: "admin.cliente.alterado",
        usuarioId: sessao.usuario.id,
        entidade: "Cliente",
        entidadeId: id,
        dados: dados.data,
      });
    } else {
      const cliente = await db.cliente.create({ data: dados.data, select: { id: true } });
      await registrarLogGlobal({
        acao: "admin.cliente.criado",
        usuarioId: sessao.usuario.id,
        entidade: "Cliente",
        entidadeId: cliente.id,
        dados: dados.data,
      });
      if (dados.data.codigoIbge) sincronizar = cliente.id;
    }
  } catch (err) {
    if (violouUnicidade(err)) return { erro: "Já existe um cliente com este CNPJ." };
    return { erro: mensagemDeErro(err) };
  }

  // Código IBGE novo ou alterado: coleta os dados externos (IBGE, SICONFI, Portal) depois da resposta.
  if (sincronizar) {
    await agendarSincronizacao({ clienteId: sincronizar, usuarioId: sessao.usuario.id, perfil: "CONTROLADOR" }, "CADASTRO").catch((err) =>
      console.error("[integracoes] não foi possível agendar a sincronização", err),
    );
  }

  revalidatePath("/admin");
  return { ok: true, mensagem: id ? "Cliente atualizado." : "Cliente cadastrado." };
}

export type MunicipioOpcao = { codigo: string; nome: string };

/** Municípios da UF segundo o IBGE, para o cadastro do cliente. */
export async function buscarMunicipiosIbge(uf: string): Promise<{ municipios?: MunicipioOpcao[]; erro?: string }> {
  await exigirAdmin();
  try {
    const lista = await listarMunicipios(uf);
    return { municipios: lista.map((m) => ({ codigo: m.codigo, nome: m.nome })) };
  } catch (err) {
    return { erro: mensagemIntegracao(err) };
  }
}

/** População mais recente do município (estimativa anual do IBGE ou, na falta, o Censo). */
export async function buscarPopulacaoIbge(codigo: string): Promise<{ populacao?: number; descricao?: string; erro?: string }> {
  await exigirAdmin();
  if (!/^\d{7}$/.test(codigo)) return { erro: "O código IBGE tem 7 dígitos." };
  try {
    const r = await obterPopulacao(codigo);
    if (!r) return { erro: "O IBGE não tem população para este código." };
    return { populacao: r.populacao, descricao: `${r.tipo === "CENSO" ? "Censo" : "Estimativa"} IBGE ${r.ano}` };
  } catch (err) {
    return { erro: mensagemIntegracao(err) };
  }
}

const esquemaSituacao = z.object({
  id: z.uuid(),
  ativo: z.enum(["true", "false"]).transform((v) => v === "true"),
});

export async function alterarSituacaoCliente(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaSituacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Requisição inválida." };
  const { id, ativo } = dados.data;

  try {
    const cliente = await db.cliente.update({ where: { id }, data: { ativo }, select: { nome: true } });
    // Quem estava com o cliente aberto volta à seleção de cliente.
    if (!ativo) await db.sessao.updateMany({ where: { clienteAtivoId: id }, data: { clienteAtivoId: null } });
    await registrarLogGlobal({
      acao: ativo ? "admin.cliente.ativado" : "admin.cliente.desativado",
      usuarioId: sessao.usuario.id,
      entidade: "Cliente",
      entidadeId: id,
      dados: { nome: cliente.nome },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin");
  return { ok: true, mensagem: ativo ? "Cliente ativado." : "Cliente desativado." };
}
