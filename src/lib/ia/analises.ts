import "server-only";
import { z } from "zod";
import { comCliente, db, type ContextoCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { ErroNegocio } from "@/lib/erros";
import type { Prisma, TipoAnaliseIA } from "@/generated/prisma/client";
import { obterConfigIA, type ConfigIA } from "./config";
import { criarProvedor, palavrasParaBusca, provedorFalsoAtivo, type ProvedorIA } from "./provedor";
import { custoEmbeddingsUsd, custoTextoUsd, limiteAtingido } from "./precos";
import { INFO_PROVEDOR, type TipoProvedor } from "./provedores";
import { buscarTrechos, prepararDocumento } from "./documento";
import { conferirCitacoes, evidenciaDasCitacoes, type CitacaoConferida, type TrechoRef } from "./citacoes";

export type EstadoIA = {
  disponivel: boolean;
  motivo: string | null;
  /** Código gravado em analises_ia.provedor. */
  provedor: ProvedorIA["nome"];
  /** Nome do provedor para exibição (ex.: "Anthropic (Claude)"). */
  rotuloProvedor: string;
  gastoMesUsd: number;
  limiteMensalUsd: number | null;
};

function inicioDoMes(agora = new Date()) {
  return new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1));
}

/** Soma do custo estimado de todas as análises do mês, de todos os clientes (política analises_ia_gasto_global). */
export async function gastoDoMesUsd() {
  const r = await db.analiseIA.aggregate({ _sum: { custoUsd: true }, where: { criadoEm: { gte: inicioDoMes() } } });
  return Number(r._sum.custoUsd ?? 0);
}

/** Disponibilidade da IA. Fora de `comCliente` (lê configuracoes_ia e o gasto global). */
export async function obterEstadoIA(config?: ConfigIA): Promise<EstadoIA> {
  const cfg = config ?? (await obterConfigIA());
  const falso = provedorFalsoAtivo();
  const gastoMesUsd = await gastoDoMesUsd();
  const base = {
    provedor: falso ? ("falso" as const) : (cfg.provedor.toLowerCase() as Lowercase<TipoProvedor>),
    rotuloProvedor: falso ? "Simulação (provedor falso)" : INFO_PROVEDOR[cfg.provedor].rotulo,
    gastoMesUsd,
    limiteMensalUsd: cfg.limiteMensalUsd,
  };
  if (!falso && cfg.pendencia) return { ...base, disponivel: false, motivo: cfg.pendencia };
  if (!falso && !cfg.habilitada) return { ...base, disponivel: false, motivo: "A IA está desabilitada pelo administrador." };
  if (limiteAtingido(gastoMesUsd, cfg.limiteMensalUsd)) {
    return {
      ...base,
      disponivel: false,
      motivo: `O limite mensal de gasto com IA (US$ ${cfg.limiteMensalUsd!.toFixed(2)}) foi atingido. Novas análises voltam no próximo mês ou com um limite maior.`,
    };
  }
  return { ...base, disponivel: true, motivo: null };
}

export type PedidoAnalise =
  | { tipo: "COMPARAR_NORMA"; cicloId: string; documentoIds: string[] }
  | { tipo: "AVALIAR_EVIDENCIA"; respostaRequisitoId: string };

/** Valida o pedido, confere a disponibilidade e o limite, e enfileira a análise (status PENDENTE). */
export async function solicitarAnalise(ctx: ContextoCliente, pedido: PedidoAnalise): Promise<string> {
  if (ctx.perfil === "SATELITE") throw new ErroNegocio("A IA é de uso exclusivo da controladoria.");
  const config = await obterConfigIA();
  const estado = await obterEstadoIA(config);
  if (!estado.disponivel) throw new ErroNegocio(estado.motivo!);

  return comCliente(ctx, async (tx) => {
    let documentoIds: string[];
    let cicloId: string | null = null;
    let respostaRequisitoId: string | null = null;

    if (pedido.tipo === "COMPARAR_NORMA") {
      const ciclo = await tx.cicloAvaliacao.findUnique({ where: { id: pedido.cicloId }, select: { status: true } });
      if (!ciclo) throw new ErroNegocio("Ciclo de autoavaliação não encontrado.");
      if (ciclo.status !== "EM_ANDAMENTO") throw new ErroNegocio("Só é possível comparar com ciclos em andamento.");
      const ids = [...new Set(pedido.documentoIds)];
      if (!ids.length) throw new ErroNegocio("Escolha ao menos um documento.");
      const achados = await tx.documento.count({ where: { id: { in: ids } } });
      if (achados !== ids.length) throw new ErroNegocio("Documento não encontrado.");
      documentoIds = ids;
      cicloId = pedido.cicloId;
    } else {
      const resposta = await tx.respostaRequisito.findUnique({
        where: { id: pedido.respostaRequisitoId },
        select: { cicloId: true, ciclo: { select: { status: true } }, documentos: { select: { id: true } } },
      });
      if (!resposta) throw new ErroNegocio("Resposta do requisito não encontrada.");
      if (resposta.ciclo.status !== "EM_ANDAMENTO") throw new ErroNegocio("Ciclo encerrado: as respostas não podem mais ser alteradas.");
      if (!resposta.documentos.length) throw new ErroNegocio("Anexe ao menos um documento de evidência ao requisito antes de avaliar.");
      documentoIds = resposta.documentos.map((d) => d.id);
      cicloId = resposta.cicloId;
      respostaRequisitoId = pedido.respostaRequisitoId;
    }

    const analise = await tx.analiseIA.create({
      data: {
        clienteId: ctx.clienteId,
        tipo: pedido.tipo,
        solicitadoPorId: ctx.usuarioId,
        documentoIds,
        cicloId,
        respostaRequisitoId,
        provedor: estado.provedor,
        modelo: config.modeloTexto,
        modeloEmbeddings: config.modeloEmbeddings,
      },
      select: { id: true },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "ia.analise.solicitada",
      usuarioId: ctx.usuarioId,
      entidade: "AnaliseIA",
      entidadeId: analise.id,
      dados: { tipo: pedido.tipo, documentoIds, cicloId, respostaRequisitoId, provedor: estado.provedor, modelo: config.modeloTexto },
    });
    return analise.id;
  });
}

const ESPERA_FILA_MS = 2 * 60_000;
const LIMITE_PROCESSAMENTO_MS = 15 * 60_000;

/**
 * Recupera a fila depois de um reinício do servidor: encerra com erro as análises presas em PROCESSANDO
 * e devolve as que ficaram PENDENTES (o `after()` não chegou a rodar) para serem reprocessadas.
 */
export async function retomarFilaIA(ctx: ContextoCliente): Promise<string[]> {
  const agora = Date.now();
  return comCliente(ctx, async (tx) => {
    const interrompidas = await tx.analiseIA.findMany({
      where: { status: "PROCESSANDO", iniciadoEm: { lt: new Date(agora - LIMITE_PROCESSAMENTO_MS) } },
      select: { id: true, tipo: true, solicitadoPorId: true },
    });
    if (interrompidas.length) {
      await tx.analiseIA.updateMany({
        where: { id: { in: interrompidas.map((a) => a.id) }, status: "PROCESSANDO" },
        data: { status: "ERRO", erro: "A análise foi interrompida antes de terminar. Solicite-a novamente.", concluidoEm: new Date() },
      });
      for (const a of interrompidas) {
        await registrarLog(tx, ctx.clienteId, {
          acao: "ia.analise.erro",
          usuarioId: a.solicitadoPorId,
          entidade: "AnaliseIA",
          entidadeId: a.id,
          dados: { tipo: a.tipo, erro: "interrompida" },
        });
      }
    }
    const pendentes = await tx.analiseIA.findMany({
      where: { status: "PENDENTE", criadoEm: { lt: new Date(agora - ESPERA_FILA_MS) } },
      orderBy: { criadoEm: "asc" },
      take: 3,
      select: { id: true },
    });
    return pendentes.map((a) => a.id);
  });
}

type Consumo = { tokensEntrada: number; tokensSaida: number; tokensEmbeddings: number };
type SugestaoNova = Omit<Prisma.SugestaoIACreateManyInput, "clienteId" | "analiseId">;
type Resultado = { sugestoes: SugestaoNova[]; resumo: Record<string, unknown> };

/**
 * Processa uma análise PENDENTE (chamado por `after()` na ação que a solicitou, ou por um processo de fila).
 * Marca PROCESSANDO de forma atômica, então duas execuções simultâneas não processam a mesma análise.
 */
export async function processarAnalise(ctx: ContextoCliente, analiseId: string) {
  const config = await obterConfigIA();
  const reservada = await comCliente(ctx, (tx) =>
    tx.analiseIA.updateMany({ where: { id: analiseId, status: "PENDENTE" }, data: { status: "PROCESSANDO", iniciadoEm: new Date() } }),
  );
  if (reservada.count === 0) return;
  const analise = await comCliente(ctx, (tx) => tx.analiseIA.findUniqueOrThrow({ where: { id: analiseId } }));
  const modelo = analise.modelo ?? config.modeloTexto;
  const modeloEmb = analise.modeloEmbeddings ?? config.modeloEmbeddings;
  const consumo: Consumo = { tokensEntrada: 0, tokensSaida: 0, tokensEmbeddings: 0 };

  try {
    const provedor = criarProvedor(config);
    const documentos = [];
    for (const id of analise.documentoIds) {
      const r = await prepararDocumento(ctx, id, provedor, modeloEmb);
      consumo.tokensEmbeddings += r.tokens;
      documentos.push(r);
    }
    const comTexto = documentos.filter((d) => d.status === "CONCLUIDA").map((d) => d.documentoId);
    if (!comTexto.length) throw new ErroNegocio("Nenhum documento tem texto extraível (PDFs digitalizados ainda não são lidos pela IA).");

    const executor = EXECUTORES[analise.tipo];
    const r = await executor({ ctx, analise, documentoIds: comTexto, provedor, modelo, modeloEmb, consumo });

    const custo = provedor.nome === "falso" ? 0 : custoTextoUsd(modelo, consumo.tokensEntrada, consumo.tokensSaida) + custoEmbeddingsUsd(modeloEmb, consumo.tokensEmbeddings);
    const resumo = { ...r.resumo, documentos: documentos.map((d) => ({ id: d.documentoId, status: d.status, trechos: d.trechos })) };
    await comCliente(ctx, async (tx) => {
      if (r.sugestoes.length) {
        await tx.sugestaoIA.createMany({ data: r.sugestoes.map((s) => ({ ...s, clienteId: ctx.clienteId, analiseId })) });
      }
      await tx.analiseIA.update({
        where: { id: analiseId },
        data: { ...consumo, status: "CONCLUIDO", custoUsd: custo, resumo: resumo as Prisma.InputJsonValue, concluidoEm: new Date(), erro: null },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "ia.analise.concluida",
        usuarioId: analise.solicitadoPorId,
        entidade: "AnaliseIA",
        entidadeId: analiseId,
        dados: { tipo: analise.tipo, modelo, sugestoes: r.sugestoes.length, ...consumo, custoUsd: custo },
      });
    });
  } catch (err) {
    const mensagem = err instanceof ErroNegocio ? err.message : "Falha ao processar a análise. Tente novamente mais tarde.";
    if (!(err instanceof ErroNegocio)) console.error("Análise de IA falhou", analiseId, err);
    const custo = custoTextoUsd(modelo, consumo.tokensEntrada, consumo.tokensSaida) + custoEmbeddingsUsd(modeloEmb, consumo.tokensEmbeddings);
    await comCliente(ctx, async (tx) => {
      await tx.analiseIA.update({
        where: { id: analiseId },
        data: { ...consumo, status: "ERRO", erro: mensagem, custoUsd: analise.provedor === "falso" ? 0 : custo, concluidoEm: new Date() },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "ia.analise.erro",
        usuarioId: analise.solicitadoPorId,
        entidade: "AnaliseIA",
        entidadeId: analiseId,
        dados: { tipo: analise.tipo, erro: err instanceof Error ? err.message.slice(0, 500) : String(err) },
      });
    });
  }
}

type Entrada = {
  ctx: ContextoCliente;
  analise: { id: string; cicloId: string | null; respostaRequisitoId: string | null };
  documentoIds: string[];
  provedor: ProvedorIA;
  modelo: string;
  modeloEmb: string;
  consumo: Consumo;
};

const SITUACOES = ["ATENDIDO", "PARCIALMENTE_ATENDIDO", "NAO_ATENDIDO", "NAO_APLICAVEL"] as const;
const esquemaCitacao = z.object({ trecho: z.string(), texto: z.string() });

/** Conteúdo de uma sugestão de resposta de requisito (o que o controlador revisa e aplica). */
export const esquemaConteudoSugestao = z.object({
  situacao: z.enum(SITUACOES),
  justificativa: z.string().trim().min(1).max(4000),
  evidencia: z.string().trim().max(4000).nullable(),
  faltantes: z.array(z.string()).default([]),
  comprova: z.enum(["SIM", "PARCIALMENTE", "NAO"]).nullable().default(null),
});
export type ConteudoSugestao = z.infer<typeof esquemaConteudoSugestao>;

const REGRAS_SISTEMA = `Você é auditor de controle interno municipal no Brasil e analisa documentos para a controladoria.
Regras obrigatórias:
- Responda somente com base nos trechos fornecidos. Não use conhecimento externo sobre o município.
- Toda afirmação precisa de citação: copie o texto LITERALMENTE do trecho (sem reescrever, sem reticências) e informe o rótulo do trecho (ex.: T3).
- Se os trechos não tratam do assunto, diga isso; não invente.
- Dados pessoais aparecem mascarados como [CPF], [NOME] etc.; nunca tente reconstruí-los.
- Escreva em português do Brasil, de forma objetiva.`;

function blocoTrechos(trechos: TrechoRef[]) {
  return trechos.map((t) => `[${t.ref}] (${t.documentoNome}${t.pagina ? `, p. ${t.pagina}` : ""})\n${t.texto}`).join("\n\n");
}

function textoRequisito(r: { codigo: string; titulo: string; descricao: string | null; orientacao: string | null; palavrasChave: string[] }) {
  return [
    `${r.codigo} — ${r.titulo}`,
    r.descricao,
    r.orientacao ? `Orientação: ${r.orientacao}` : null,
    r.palavrasChave.length ? `Palavras-chave: ${r.palavrasChave.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Primeiros ~`n` caracteres do trecho, cortados em fim de palavra (usado pelo provedor falso). */
function inicioDoTrecho(texto: string, n = 90) {
  if (texto.length <= n) return texto;
  const corte = texto.lastIndexOf(" ", n);
  return texto.slice(0, corte > 20 ? corte : n);
}

/** O provedor falso considera o requisito tratado quando alguma palavra relevante dele aparece nos trechos. */
function simularRelacao(requisito: string, trechos: TrechoRef[]) {
  const palavras = new Set(palavrasParaBusca(requisito).filter((p) => p.length >= 5));
  return trechos.find((t) => palavrasParaBusca(t.texto).some((p) => palavras.has(p)));
}

const TRECHOS_POR_REQUISITO = 4;
const REQUISITOS_POR_CHAMADA = 6;

async function compararComNorma({ ctx, analise, documentoIds, provedor, modelo, modeloEmb, consumo }: Entrada): Promise<Resultado> {
  const { respostas, documentos } = await comCliente(ctx, async (tx) => ({
    respostas: await tx.respostaRequisito.findMany({
      where: { cicloId: analise.cicloId! },
      orderBy: { requisito: { ordem: "asc" } },
      select: {
        id: true,
        requisito: { select: { codigo: true, titulo: true, descricao: true, orientacao: true, palavrasChave: true } },
      },
    }),
    documentos: await tx.documento.findMany({ where: { id: { in: documentoIds } }, select: { id: true, nome: true } }),
  }));
  if (!respostas.length) throw new ErroNegocio("O ciclo não tem requisitos para comparar.");

  const consultas = respostas.map((r) => textoRequisito(r.requisito));
  const emb = await provedor.embeddings(consultas, modeloEmb);
  consumo.tokensEmbeddings += emb.tokens;
  const proximos = await comCliente(ctx, async (tx) => {
    const lista = [];
    for (const v of emb.vetores) lista.push(await buscarTrechos(tx, documentos, v, TRECHOS_POR_REQUISITO));
    return lista;
  });

  const esquema = z.object({
    avaliacoes: z.array(
      z.object({
        requisito: z.string(),
        relacionado: z.boolean(),
        situacao: z.enum(SITUACOES),
        justificativa: z.string(),
        citacoes: z.array(esquemaCitacao),
      }),
    ),
  });

  const sugestoes: SugestaoNova[] = [];
  let semRelacao = 0;
  let semCitacao = 0;
  let descartadasTotal = 0;

  for (let i = 0; i < respostas.length; i += REQUISITOS_POR_CHAMADA) {
    const lote = respostas.slice(i, i + REQUISITOS_POR_CHAMADA).map((r, j) => ({ resposta: r, consulta: consultas[i + j], trechos: proximos[i + j] }));
    const refs = new Map<string, TrechoRef>();
    for (const item of lote) {
      for (const t of item.trechos) if (!refs.has(t.id)) refs.set(t.id, { ...t, ref: `T${refs.size + 1}` });
    }
    const trechosLote = [...refs.values()];
    const porRequisito = new Map(lote.map((item) => [item.resposta.requisito.codigo, item.trechos.map((t) => refs.get(t.id)!)]));

    const usuario = `Avalie se o documento atende a cada requisito da norma abaixo.
Para cada requisito: "relacionado" = false se nenhum trecho trata do assunto; caso contrário, sugira a situação
(ATENDIDO, PARCIALMENTE_ATENDIDO, NAO_ATENDIDO ou NAO_APLICAVEL), justifique em até 4 frases e cite os trechos literais que sustentam a conclusão.

REQUISITOS
${lote.map((item) => `### ${item.consulta}\nTrechos mais relevantes: ${porRequisito.get(item.resposta.requisito.codigo)!.map((t) => t.ref).join(", ") || "nenhum"}`).join("\n\n")}

TRECHOS DO DOCUMENTO
${blocoTrechos(trechosLote)}`;

    const r = await provedor.gerarJson({
      modelo,
      nome: "comparacao_norma",
      sistema: REGRAS_SISTEMA,
      usuario,
      esquema,
      simular: () => ({
        avaliacoes: lote.map((item) => {
          const relacionado = simularRelacao(item.consulta, porRequisito.get(item.resposta.requisito.codigo)!);
          return {
            requisito: item.resposta.requisito.codigo,
            relacionado: !!relacionado,
            situacao: relacionado ? "ATENDIDO" : "NAO_ATENDIDO",
            justificativa: relacionado ? `Simulação: o trecho ${relacionado.ref} trata do requisito.` : "Simulação: nenhum trecho trata do requisito.",
            citacoes: relacionado
              ? [
                  { trecho: relacionado.ref, texto: inicioDoTrecho(relacionado.texto) },
                  { trecho: relacionado.ref, texto: "Este texto foi inventado e não existe no documento analisado." },
                ]
              : [],
          };
        }),
      }),
    });
    consumo.tokensEntrada += r.tokensEntrada;
    consumo.tokensSaida += r.tokensSaida;

    for (const av of r.dados.avaliacoes) {
      const item = lote.find((x) => x.resposta.requisito.codigo === av.requisito.trim());
      if (!item) continue;
      if (!av.relacionado) {
        semRelacao++;
        continue;
      }
      const { validas, descartadas } = conferirCitacoes(av.citacoes, trechosLote);
      descartadasTotal += descartadas;
      // Nenhuma afirmação sem citação: sem trecho literal conferido, a sugestão não é criada.
      if (!validas.length) {
        semCitacao++;
        continue;
      }
      sugestoes.push(novaSugestao(item.resposta.id, { situacao: av.situacao, justificativa: av.justificativa, faltantes: [], comprova: null }, validas, descartadas));
    }
  }

  return {
    sugestoes,
    resumo: { requisitos: respostas.length, sugestoes: sugestoes.length, semRelacao, semCitacao, citacoesDescartadas: descartadasTotal },
  };
}

async function avaliarEvidencia({ ctx, analise, documentoIds, provedor, modelo, modeloEmb, consumo }: Entrada): Promise<Resultado> {
  const { resposta, documentos } = await comCliente(ctx, async (tx) => ({
    resposta: await tx.respostaRequisito.findUniqueOrThrow({
      where: { id: analise.respostaRequisitoId! },
      select: { id: true, requisito: { select: { codigo: true, titulo: true, descricao: true, orientacao: true, palavrasChave: true } } },
    }),
    documentos: await tx.documento.findMany({ where: { id: { in: documentoIds } }, select: { id: true, nome: true } }),
  }));
  const consulta = textoRequisito(resposta.requisito);
  const emb = await provedor.embeddings([consulta], modeloEmb);
  consumo.tokensEmbeddings += emb.tokens;
  const trechos = (await comCliente(ctx, (tx) => buscarTrechos(tx, documentos, emb.vetores[0], 8))).map((t, i) => ({ ...t, ref: `T${i + 1}` }));

  const esquema = z.object({
    comprova: z.enum(["SIM", "PARCIALMENTE", "NAO"]),
    situacao: z.enum(SITUACOES),
    justificativa: z.string(),
    faltantes: z.array(z.string()),
    citacoes: z.array(esquemaCitacao),
  });
  const usuario = `Os documentos abaixo foram anexados como evidência do requisito. Diga se comprovam o atendimento
(SIM, PARCIALMENTE ou NAO), sugira a situação, justifique em até 4 frases, liste o que falta para comprovar
(vazio se nada falta) e cite os trechos literais que sustentam a conclusão.

REQUISITO
${consulta}

TRECHOS DOS DOCUMENTOS
${blocoTrechos(trechos)}`;

  const r = await provedor.gerarJson({
    modelo,
    nome: "avaliacao_evidencia",
    sistema: REGRAS_SISTEMA,
    usuario,
    esquema,
    simular: () => {
      const relacionado = simularRelacao(consulta, trechos);
      return relacionado
        ? {
            comprova: "PARCIALMENTE",
            situacao: "PARCIALMENTE_ATENDIDO",
            justificativa: `Simulação: o trecho ${relacionado.ref} trata do requisito, mas não comprova a execução.`,
            faltantes: ["Comprovante de execução no período avaliado"],
            citacoes: [{ trecho: relacionado.ref, texto: inicioDoTrecho(relacionado.texto) }],
          }
        : { comprova: "NAO", situacao: "NAO_ATENDIDO", justificativa: "Simulação: os documentos não tratam do requisito.", faltantes: ["Documento que trate do requisito"], citacoes: [] };
    },
  });
  consumo.tokensEntrada += r.tokensEntrada;
  consumo.tokensSaida += r.tokensSaida;

  const { validas, descartadas } = conferirCitacoes(r.dados.citacoes, trechos);
  // Afirmar que o documento comprova algo exige citação; a conclusão "não comprova" pode vir sem trecho.
  if (!validas.length && r.dados.comprova !== "NAO") {
    return { sugestoes: [], resumo: { requisitos: 1, sugestoes: 0, semCitacao: 1, citacoesDescartadas: descartadas } };
  }
  const conteudo = { situacao: r.dados.situacao, justificativa: r.dados.justificativa, faltantes: r.dados.faltantes, comprova: r.dados.comprova };
  return {
    sugestoes: [novaSugestao(resposta.id, conteudo, validas, descartadas)],
    resumo: { requisitos: 1, sugestoes: 1, comprova: r.dados.comprova, citacoesDescartadas: descartadas },
  };
}

function novaSugestao(
  respostaRequisitoId: string,
  c: Omit<ConteudoSugestao, "evidencia">,
  citacoes: CitacaoConferida[],
  descartadas: number,
): SugestaoNova {
  const conteudo: ConteudoSugestao = {
    situacao: c.situacao,
    justificativa: c.justificativa.trim().slice(0, 4000) || "Sem justificativa.",
    evidencia: citacoes.length ? evidenciaDasCitacoes(citacoes).slice(0, 4000) : null,
    faltantes: c.faltantes,
    comprova: c.comprova,
  };
  return {
    respostaRequisitoId,
    conteudo: conteudo as Prisma.InputJsonValue,
    citacoes: citacoes as unknown as Prisma.InputJsonValue,
    citacoesDescartadas: descartadas,
  };
}

const EXECUTORES: Record<TipoAnaliseIA, (e: Entrada) => Promise<Resultado>> = {
  COMPARAR_NORMA: compararComNorma,
  AVALIAR_EVIDENCIA: avaliarEvidencia,
};
