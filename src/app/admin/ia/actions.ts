"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { comAdmin, exigirAdmin } from "@/lib/admin";
import { registrarLogGlobal } from "@/lib/auditoria";
import { cifrar, criptografiaDisponivel, decifrar } from "@/lib/cripto";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import {
  chaveDoAmbiente,
  CONTEXTO_CHAVE_EMBEDDINGS,
  CONTEXTO_CHAVE_IA,
  modeloNaLista,
  testarConexao,
} from "@/lib/ia/config";
import { CHAVE_DISPENSADA, criarConexaoIA } from "@/lib/ia/provedor";
import {
  DIMENSOES_EMBEDDING,
  INFO_PROVEDOR,
  PROVEDORES_EMBEDDINGS,
  PROVEDORES_IA,
  type TipoProvedor,
} from "@/lib/ia/provedores";
import type { EstadoAcao } from "@/lib/acoes";

const SEM_CRIPTOGRAFIA = "A variável CHAVE_CRIPTOGRAFIA não está configurada no servidor; nada foi salvo.";

/** Modelos de embeddings conhecidos que não geram 1536 dimensões (a coluna é vector(1536)). */
const EMBEDDINGS_INCOMPATIVEIS: Record<string, number> = {
  "text-embedding-004": 768,
  "embedding-001": 768,
  "mistral-embed": 1024,
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
};

const modelo = (rotulo: string) =>
  z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/, { error: `Informe um ${rotulo} válido (ex.: gpt-4.1-mini).` });

const urlBase = (rotulo: string) =>
  z
    .string()
    .trim()
    .max(300, { error: `A ${rotulo} deve ter no máximo 300 caracteres.` })
    .refine(
      (v) => {
        if (v === "") return true;
        try {
          const u = new URL(v);
          return (u.protocol === "https:" || u.protocol === "http:") && !u.username && !u.password;
        } catch {
          return false;
        }
      },
      { error: `Informe na ${rotulo} um endereço http(s) válido, sem usuário e senha (ex.: https://api.groq.com/openai/v1).` },
    )
    .transform((v) => v.replace(/\/+$/, "") || null);

const textoChave = z
  .string()
  .trim()
  .refine((v) => v === "" || /^\S{8,400}$/.test(v), { error: "A chave da API não pode ter espaços e deve ter ao menos 8 caracteres." });

function conferirPrefixo(provedor: TipoProvedor, chave: string) {
  if (!chave) return null;
  if (provedor === "OPENAI" && !/^sk-[A-Za-z0-9_-]{16,}$/.test(chave)) return "A chave da OpenAI começa com “sk-” e não tem espaços.";
  if (provedor === "ANTHROPIC" && !chave.startsWith("sk-ant-")) return "A chave da Anthropic começa com “sk-ant-”.";
  return null;
}

const camposConfig = z.object({
  provedor: z.enum(PROVEDORES_IA, { error: "Escolha o provedor de IA." }),
  urlBase: urlBase("URL base"),
  chave: textoChave,
  modeloTexto: modelo("modelo de texto"),
  provedorEmbeddings: z
    .union([z.literal(""), z.enum(PROVEDORES_EMBEDDINGS)], { error: "Escolha o provedor de embeddings." })
    .transform((v) => v || null),
  urlBaseEmbeddings: urlBase("URL base dos embeddings"),
  chaveEmbeddings: textoChave,
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

const esquemaConfig = camposConfig.superRefine((d, ctx) => {
  const erro = (message: string) => ctx.addIssue({ code: "custom", message });
  if (d.provedor === "OPENAI_COMPATIVEL" && !d.urlBase) erro("Informe a URL base do serviço compatível com a OpenAI.");
  if (d.provedorEmbeddings === "OPENAI_COMPATIVEL" && !d.urlBaseEmbeddings) {
    erro("Informe a URL base do serviço de embeddings compatível com a OpenAI.");
  }
  if (d.provedor === "ANTHROPIC" && !d.provedorEmbeddings) {
    erro("A Anthropic não gera embeddings: escolha um provedor de embeddings (OpenAI, Google ou compatível).");
  }
  const prefixo = conferirPrefixo(d.provedor, d.chave) ?? (d.provedorEmbeddings && conferirPrefixo(d.provedorEmbeddings, d.chaveEmbeddings));
  if (prefixo) erro(prefixo);
  const dimensoes = EMBEDDINGS_INCOMPATIVEIS[d.modeloEmbeddings.slice(d.modeloEmbeddings.lastIndexOf("/") + 1).split(":")[0]];
  if (dimensoes) {
    erro(`O modelo ${d.modeloEmbeddings} gera ${dimensoes} dimensões; o sistema exige ${DIMENSOES_EMBEDDING}. Use, por exemplo, text-embedding-3-small ou gemini-embedding-001.`);
  }
});

function lerFormulario(formData: FormData) {
  const campo = (nome: string) => formData.get(nome) ?? "";
  return {
    provedor: campo("provedor"),
    urlBase: campo("urlBase"),
    chave: campo("chave"),
    modeloTexto: campo("modeloTexto"),
    provedorEmbeddings: campo("provedorEmbeddings"),
    urlBaseEmbeddings: campo("urlBaseEmbeddings"),
    chaveEmbeddings: campo("chaveEmbeddings"),
    modeloEmbeddings: campo("modeloEmbeddings"),
    limiteMensalUsd: campo("limiteMensalUsd"),
    habilitada: formData.get("habilitada") ?? undefined,
  };
}

function revalidar() {
  revalidatePath("/admin/ia");
  revalidatePath("/configuracoes");
}

export async function salvarConfigIA(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const sessao = await exigirAdmin();
  if (!criptografiaDisponivel()) return { erro: SEM_CRIPTOGRAFIA };
  const dados = esquemaConfig.safeParse(lerFormulario(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { chave, chaveEmbeddings, ...config } = dados.data;
  const pe = config.provedorEmbeddings;

  let descartadas = false;
  try {
    const log = await comAdmin(sessao.usuario.id, async (tx) => {
      const atual = await tx.configuracaoIA.findUnique({
        where: { id: 1 },
        select: { provedor: true, chaveFinal: true, provedorEmbeddings: true, chaveEmbeddingsFinal: true },
      });
      // Chave guardada para outro provedor não serve ao novo: é descartada se nenhuma nova for digitada.
      const trocouTexto = (atual?.provedor ?? "OPENAI") !== config.provedor;
      const trocouEmb = (atual?.provedorEmbeddings ?? null) !== pe;
      const chaveTexto = chave
        ? { chaveCifrada: cifrar(chave, CONTEXTO_CHAVE_IA), chaveFinal: chave.slice(-4) }
        : trocouTexto && atual?.chaveFinal
          ? { chaveCifrada: null, chaveFinal: null }
          : {};
      const chaveEmb = !pe
        ? { chaveEmbeddingsCifrada: null, chaveEmbeddingsFinal: null, urlBaseEmbeddings: null }
        : chaveEmbeddings
          ? { chaveEmbeddingsCifrada: cifrar(chaveEmbeddings, CONTEXTO_CHAVE_EMBEDDINGS), chaveEmbeddingsFinal: chaveEmbeddings.slice(-4) }
          : trocouEmb && atual?.chaveEmbeddingsFinal
            ? { chaveEmbeddingsCifrada: null, chaveEmbeddingsFinal: null }
            : {};
      descartadas = ("chaveFinal" in chaveTexto && !chave) || (Boolean(pe) && "chaveEmbeddingsFinal" in chaveEmb && !chaveEmbeddings);

      const temChave =
        Boolean(chave || (!trocouTexto && atual?.chaveFinal) || chaveDoAmbiente(config.provedor)) ||
        config.provedor === "OPENAI_COMPATIVEL";
      const temChaveEmb = !pe
        ? temChave
        : Boolean(chaveEmbeddings || (!trocouEmb && atual?.chaveEmbeddingsFinal) || chaveDoAmbiente(pe)) || pe === "OPENAI_COMPATIVEL";
      if (config.habilitada && !temChave) {
        throw new ErroNegocio(`Informe a chave da API de ${INFO_PROVEDOR[config.provedor].rotulo} para habilitar a IA.`);
      }
      if (config.habilitada && !temChaveEmb) {
        throw new ErroNegocio(`Informe a chave da API de ${INFO_PROVEDOR[pe!].rotulo} para os embeddings.`);
      }

      const valores = { ...config, ...chaveTexto, ...chaveEmb, alteradoPorId: sessao.usuario.id };
      const gravado = await tx.configuracaoIA.upsert({
        where: { id: 1 },
        create: { id: 1, ...valores },
        update: valores,
        select: { chaveFinal: true, chaveEmbeddingsFinal: true },
      });
      return gravado;
    });
    await registrarLogGlobal({
      acao: "admin.ia.configurada",
      usuarioId: sessao.usuario.id,
      entidade: "ConfiguracaoIA",
      entidadeId: "1",
      dados: {
        ...config,
        chaveAlterada: Boolean(chave),
        chaveFinal: log.chaveFinal,
        chaveEmbeddingsAlterada: Boolean(chaveEmbeddings),
        chaveEmbeddingsFinal: log.chaveEmbeddingsFinal,
      },
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidar();
  const base = chave || chaveEmbeddings ? "Configuração e nova chave salvas." : "Configuração salva.";
  return { ok: true, mensagem: descartadas ? `${base} A chave do provedor anterior foi descartada.` : base };
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

  revalidar();
  return { ok: true, mensagem: "Chave removida e IA desabilitada." };
}

export type EstadoTeste = { ok: boolean; mensagem: string; aviso?: string };

type Origem = "digitada" | "salva" | "ambiente" | "dispensada";

const DESCRICAO_ORIGEM: Record<Origem, string> = {
  digitada: "Chave digitada (ainda não salva).",
  salva: "Chave cadastrada.",
  ambiente: "Chave do ambiente do servidor.",
  dispensada: "Sem chave.",
};

/** Chave digitada; sem ela, a salva (se for do mesmo provedor), a do ambiente ou nenhuma (serviço compatível). */
function escolherChave(provedor: TipoProvedor, digitada: string, salva: { provedor: string | null; cifrada: string | null }, contexto: string) {
  if (digitada) return { chave: digitada, origem: "digitada" as Origem };
  if (salva.cifrada && salva.provedor === provedor) return { chave: decifrar(salva.cifrada, contexto), origem: "salva" as Origem };
  const ambiente = chaveDoAmbiente(provedor);
  if (ambiente) return { chave: ambiente, origem: "ambiente" as Origem };
  return provedor === "OPENAI_COMPATIVEL" ? { chave: null, origem: "dispensada" as Origem } : null;
}

/** Testa as chaves digitadas (ainda não salvas) ou, sem elas, as em uso. Não grava nada além do log. */
export async function testarConexaoIA(formData: FormData): Promise<EstadoTeste> {
  const sessao = await exigirAdmin();
  const lidos = lerFormulario(formData);
  const parcial = camposConfig.pick({
    provedor: true,
    urlBase: true,
    chave: true,
    provedorEmbeddings: true,
    urlBaseEmbeddings: true,
    chaveEmbeddings: true,
  });
  const dados = parcial.safeParse(lidos);
  if (!dados.success) return { ok: false, mensagem: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const d = dados.data;
  const prefixo = conferirPrefixo(d.provedor, d.chave) ?? (d.provedorEmbeddings && conferirPrefixo(d.provedorEmbeddings, d.chaveEmbeddings));
  if (prefixo) return { ok: false, mensagem: prefixo };

  let texto: ReturnType<typeof escolherChave>;
  let emb: ReturnType<typeof escolherChave> = null;
  try {
    const salva = await comAdmin(sessao.usuario.id, (tx) =>
      tx.configuracaoIA.findUnique({
        where: { id: 1 },
        select: { provedor: true, chaveCifrada: true, provedorEmbeddings: true, chaveEmbeddingsCifrada: true },
      }),
    );
    texto = escolherChave(d.provedor, d.chave, { provedor: salva?.provedor ?? null, cifrada: salva?.chaveCifrada ?? null }, CONTEXTO_CHAVE_IA);
    if (d.provedorEmbeddings) {
      emb = escolherChave(
        d.provedorEmbeddings,
        d.chaveEmbeddings,
        { provedor: salva?.provedorEmbeddings ?? null, cifrada: salva?.chaveEmbeddingsCifrada ?? null },
        CONTEXTO_CHAVE_EMBEDDINGS,
      );
    }
  } catch (err) {
    return { ok: false, mensagem: mensagemDeErro(err) };
  }
  const rotulo = INFO_PROVEDOR[d.provedor].rotulo;
  if (!texto) return { ok: false, mensagem: `Nenhuma chave cadastrada para ${rotulo}. Digite uma chave para testar.` };

  const resultado = await testarConexao(d.provedor, texto.chave, d.urlBase);
  const avisos: string[] = [];
  let resultadoEmb: Awaited<ReturnType<typeof testarConexao>> | null = null;
  let falhaEmb: string | null = null;

  if (resultado.ok) {
    const modeloTexto = String(lidos.modeloTexto).trim();
    const modeloEmb = String(lidos.modeloEmbeddings).trim();
    if (modeloTexto && resultado.modelos?.length && !modeloNaLista(modeloTexto, resultado.modelos)) {
      avisos.push(`Modelo de texto não encontrado para esta chave: ${modeloTexto}.`);
    }

    const conexaoEmb = d.provedorEmbeddings
      ? emb && { provedor: d.provedorEmbeddings, chave: emb.chave, urlBase: d.urlBaseEmbeddings }
      : d.provedor !== "ANTHROPIC"
        ? { provedor: d.provedor, chave: texto.chave, urlBase: d.urlBase }
        : null;
    if (d.provedorEmbeddings && !emb) {
      falhaEmb = `Nenhuma chave cadastrada para os embeddings (${INFO_PROVEDOR[d.provedorEmbeddings].rotulo}).`;
    } else if (d.provedorEmbeddings && emb) {
      resultadoEmb = await testarConexao(d.provedorEmbeddings, emb.chave, d.urlBaseEmbeddings);
      if (!resultadoEmb.ok) falhaEmb = `Embeddings: ${resultadoEmb.mensagem}`;
    }
    // Chamada mínima de embeddings (poucos tokens) para conferir a dimensão exigida pela coluna vector(1536).
    if (conexaoEmb && modeloEmb && !falhaEmb) {
      try {
        await criarConexaoIA({ ...conexaoEmb, chave: conexaoEmb.chave ?? CHAVE_DISPENSADA }).embeddings(["teste de conexão"], modeloEmb);
      } catch (err) {
        falhaEmb = `Embeddings (${modeloEmb}): ${err instanceof Error ? err.message : "falha ao gerar o vetor de teste."}`;
      }
    }
  }

  await registrarLogGlobal({
    acao: "admin.ia.testada",
    usuarioId: sessao.usuario.id,
    entidade: "ConfiguracaoIA",
    entidadeId: "1",
    dados: {
      provedor: d.provedor,
      origem: texto.origem,
      chaveFinal: texto.chave && texto.origem !== "dispensada" ? texto.chave.slice(-4) : null,
      ok: resultado.ok,
      status: resultado.status,
      provedorEmbeddings: d.provedorEmbeddings,
      embeddingsOk: resultado.ok ? !falhaEmb : null,
    },
  });

  if (!resultado.ok) return { ok: false, mensagem: resultado.mensagem };
  if (falhaEmb) avisos.push(falhaEmb);
  return {
    ok: !falhaEmb,
    mensagem: `${resultado.mensagem} ${DESCRICAO_ORIGEM[texto.origem]}${falhaEmb ? " Os embeddings, porém, falharam." : " Embeddings conferidos."}`,
    aviso: avisos.length ? avisos.join(" ") : undefined,
  };
}
