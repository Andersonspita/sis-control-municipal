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
import { slugMunicipioValido } from "@/lib/municipios";
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
  municipioId: z.union([z.uuid(), z.literal("novo")], { error: "Selecione o município." }),
  populacao: z
    .string()
    .trim()
    .regex(/^\d{0,9}$/, { error: "Informe a população só com números." })
    .transform((v) => (v ? Number(v) : null)),
});

/** Dados do município (o cliente herda nome, UF e código IBGE dele). */
const esquemaMunicipio = z.object({
  municipioNome: z.string().trim().min(2, { error: "Informe o município." }).max(120),
  uf: z.enum(UFS, { error: "Selecione a UF." }),
  codigoIbge: z
    .string()
    .trim()
    .regex(/^(\d{7})?$/, { error: "O código IBGE tem 7 dígitos." })
    .transform((v) => v || null),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .refine(slugMunicipioValido, { error: "Link inválido: use de 3 a 80 letras minúsculas, números e hífens." }),
});

type DadosMunicipio = z.infer<typeof esquemaMunicipio>;

/** Confere link e código IBGE livres antes de gravar, para devolver uma mensagem clara. */
async function conferirMunicipioLivre(m: DadosMunicipio, idAtual?: string) {
  const conflito = await db.municipio.findFirst({
    where: {
      OR: [{ slug: m.slug }, ...(m.codigoIbge ? [{ codigoIbge: m.codigoIbge }] : [])],
      ...(idAtual && { id: { not: idAtual } }),
    },
    select: { slug: true, nome: true, uf: true },
  });
  if (!conflito) return;
  throw new ErroNegocio(
    conflito.slug === m.slug
      ? `O link "${m.slug}" já é usado por ${conflito.nome}/${conflito.uf}.`
      : `O código IBGE já pertence a ${conflito.nome}/${conflito.uf}. Escolha esse município na lista.`,
  );
}

/** Código IBGE novo ou alterado: coleta os dados externos (IBGE, SICONFI, Portal) depois da resposta. */
async function agendarSincronizacoes(clienteIds: string[], usuarioId: string) {
  for (const clienteId of clienteIds) {
    await agendarSincronizacao({ clienteId, usuarioId, perfil: "CONTROLADOR" }, "CADASTRO").catch((err) =>
      console.error("[integracoes] não foi possível agendar a sincronização", err),
    );
  }
}

export async function salvarCliente(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const entrada = Object.fromEntries(formData);
  const dados = esquemaCliente.safeParse(entrada);
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { municipioId, ...cliente } = dados.data;
  let novoMunicipio: DadosMunicipio | null = null;
  if (municipioId === "novo") {
    const m = esquemaMunicipio.safeParse(entrada);
    if (!m.success) return { erro: m.error.issues[0]?.message };
    novoMunicipio = m.data;
  }
  const id = formData.get("id");

  let sincronizar: string | null = null;
  try {
    if (novoMunicipio) await conferirMunicipioLivre(novoMunicipio);
    const anterior =
      typeof id === "string" && id
        ? await db.cliente.findUnique({ where: { id }, select: { id: true, codigoIbge: true } })
        : null;
    if (id && !anterior) throw new ErroNegocio("Cliente não encontrado.");

    const salvo = await db.$transaction(async (tx) => {
      const campos = { id: true, nome: true, uf: true } as const;
      const municipio = novoMunicipio
        ? await tx.municipio.create({
            data: {
              nome: novoMunicipio.municipioNome,
              uf: novoMunicipio.uf,
              codigoIbge: novoMunicipio.codigoIbge,
              slug: novoMunicipio.slug,
            },
            select: campos,
          })
        : await tx.municipio.findUnique({ where: { id: municipioId }, select: campos });
      if (!municipio) throw new ErroNegocio("Município não encontrado.");
      // municipio/uf/codigo_ibge do cliente são copiados do município pelo banco (gatilho clientes_municipio).
      const data = { ...cliente, municipioId: municipio.id, municipio: municipio.nome, uf: municipio.uf };
      const select = { id: true, codigoIbge: true, municipio: true, uf: true } as const;
      return anterior
        ? tx.cliente.update({ where: { id: anterior.id }, data, select })
        : tx.cliente.create({ data, select });
    });

    if (salvo.codigoIbge && salvo.codigoIbge !== anterior?.codigoIbge) sincronizar = salvo.id;
    await registrarLogGlobal({
      acao: anterior ? "admin.cliente.alterado" : "admin.cliente.criado",
      usuarioId: sessao.usuario.id,
      entidade: "Cliente",
      entidadeId: salvo.id,
      dados: { ...cliente, municipio: salvo.municipio, uf: salvo.uf, codigoIbge: salvo.codigoIbge, novoMunicipio },
    });
  } catch (err) {
    if (violouUnicidade(err)) return { erro: "Já existe um cliente com este CNPJ." };
    return { erro: mensagemDeErro(err) };
  }

  if (sincronizar) await agendarSincronizacoes([sincronizar], sessao.usuario.id);

  revalidatePath("/admin");
  return { ok: true, mensagem: id ? "Cliente atualizado." : "Cliente cadastrado." };
}

export async function salvarMunicipio(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const id = z.uuid().safeParse(formData.get("id"));
  const dados = esquemaMunicipio.safeParse(Object.fromEntries(formData));
  if (!id.success) return { erro: "Requisição inválida." };
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { municipioNome, uf, codigoIbge, slug } = dados.data;

  let sincronizar: string[] = [];
  try {
    const anterior = await db.municipio.findUnique({ where: { id: id.data }, select: { codigoIbge: true } });
    if (!anterior) throw new ErroNegocio("Município não encontrado.");
    await conferirMunicipioLivre(dados.data, id.data);
    // O banco replica nome, UF e código IBGE para as entidades do município.
    await db.municipio.update({ where: { id: id.data }, data: { nome: municipioNome, uf, codigoIbge, slug } });
    if (codigoIbge && codigoIbge !== anterior.codigoIbge) {
      const clientes = await db.cliente.findMany({ where: { municipioId: id.data, ativo: true }, select: { id: true } });
      sincronizar = clientes.map((c) => c.id);
    }
    await registrarLogGlobal({
      acao: "admin.municipio.alterado",
      usuarioId: sessao.usuario.id,
      entidade: "Municipio",
      entidadeId: id.data,
      dados: dados.data,
    });
  } catch (err) {
    if (violouUnicidade(err)) return { erro: "Já existe um município com este link ou código IBGE." };
    return { erro: mensagemDeErro(err) };
  }

  await agendarSincronizacoes(sincronizar, sessao.usuario.id);
  revalidatePath("/admin");
  return { ok: true, mensagem: "Município atualizado." };
}

export async function alterarSituacaoMunicipio(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  const dados = esquemaSituacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: "Requisição inválida." };
  const { id, ativo } = dados.data;

  try {
    const municipio = await db.municipio.update({ where: { id }, data: { ativo }, select: { slug: true } });
    // Quem entrou pelo link desativado é desconectado; as entidades seguem acessíveis pelo /login geral.
    if (!ativo) await db.sessao.deleteMany({ where: { municipioAcessoId: id } });
    await registrarLogGlobal({
      acao: ativo ? "admin.municipio.ativado" : "admin.municipio.desativado",
      usuarioId: sessao.usuario.id,
      entidade: "Municipio",
      entidadeId: id,
      dados: { slug: municipio.slug },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/admin");
  return { ok: true, mensagem: ativo ? "Link do município ativado." : "Link do município desativado." };
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
