"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { arquivosDoFormulario, comArquivos, registrarDocumentos } from "@/lib/documentos";
import {
  buscarOrigemAcao,
  buscarOrigemRequisito,
  buscarProrrogacaoPendente,
  travarDemanda,
  vincularEvidenciasDaResposta,
} from "@/lib/dados/demandas";
import { hojeComoDataSimples } from "@/lib/datas";
import { numeroDemanda, STATUS_ABERTOS } from "@/lib/demandas";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";
import type { StatusDemanda, TipoTramite } from "@/generated/prisma/client";

const data = z.iso.date({ error: "Informe uma data válida." }).transform((v) => new Date(v));
const dataFutura = data.refine((d) => d >= hojeComoDataSimples(), { error: "O prazo não pode estar no passado." });
const textoOpcional = z
  .string()
  .trim()
  .max(5000)
  .optional()
  .transform((v) => v || undefined);
const textoObrigatorio = (mensagem: string) => z.string().trim().min(3, { error: mensagem }).max(5000);
const idOpcional = z.union([z.uuid({ error: "Origem da demanda inválida." }), z.literal("").transform(() => undefined)]).optional();

const esquemaCriacao = z.object({
  assunto: z.string().trim().min(5, { error: "Informe o assunto (mínimo de 5 caracteres)." }).max(200),
  descricao: z.string().trim().min(10, { error: "Descreva o que está sendo solicitado (mínimo de 10 caracteres)." }).max(10000),
  unidadeDestinoId: z.uuid({ error: "Selecione a unidade destinatária." }),
  prazo: dataFutura,
  prioridade: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]),
  respostaRequisitoId: idOpcional,
  acaoId: idOpcional,
});

export async function criarDemanda(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaCriacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  let criada: { id: string; caminhos: string[] };
  try {
    criada = await comArquivos(ctx.clienteId, arquivosDoFormulario(formData), (salvos) =>
      comCliente(ctx, async (tx) => {
        const unidade = await tx.unidade.findFirst({
          where: { id: dados.data.unidadeDestinoId, ativo: true },
          select: { id: true, nome: true },
        });
        if (!unidade) throw new ErroNegocio("Unidade destinatária não encontrada.");

        const { respostaRequisitoId, acaoId } = dados.data;
        const origemRequisito = respostaRequisitoId ? await buscarOrigemRequisito(tx, respostaRequisitoId) : null;
        if (origemRequisito && !origemRequisito.ok) throw new ErroNegocio(origemRequisito.motivo);
        const origemAcao = acaoId ? await buscarOrigemAcao(tx, acaoId) : null;
        if (origemAcao && !origemAcao.ok) throw new ErroNegocio(origemAcao.motivo);

        const ano = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric" }).format(new Date()));
        // Numeração sequencial por cliente e ano, serializada por trava transacional.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`demanda:${ctx.clienteId}:${ano}`}, 0))`;
        const ultima = await tx.demanda.aggregate({ where: { ano }, _max: { numero: true } });
        const numero = (ultima._max.numero ?? 0) + 1;

        const demanda = await tx.demanda.create({
          data: { ...dados.data, clienteId: ctx.clienteId, numero, ano, criadoPorId: ctx.usuarioId },
          select: { id: true },
        });
        const tramite = await tx.tramitacaoDemanda.create({
          data: {
            clienteId: ctx.clienteId,
            demandaId: demanda.id,
            tipo: "ENVIO",
            statusNovo: "ENVIADA",
            usuarioId: ctx.usuarioId,
            usuarioNome: ctx.usuario.nome,
          },
          select: { id: true },
        });
        await registrarDocumentos(tx, ctx, salvos, { demandaId: demanda.id, tramiteId: tramite.id });
        await registrarLog(tx, ctx.clienteId, {
          acao: "demanda.criada",
          usuarioId: ctx.usuarioId,
          entidade: "Demanda",
          entidadeId: demanda.id,
          dados: {
            numero: numeroDemanda(numero, ano),
            assunto: dados.data.assunto,
            unidade: unidade.nome,
            prazo: dados.data.prazo.toISOString().slice(0, 10),
            prioridade: dados.data.prioridade,
            anexos: salvos.length,
            ...(origemRequisito?.ok && { respostaRequisitoId, requisito: origemRequisito.origem.requisito.codigo }),
            ...(origemAcao?.ok && { acaoId }),
          },
        });
        const caminhos = [
          ...(origemRequisito?.ok ? [`/autoavaliacao/${origemRequisito.origem.cicloId}`] : []),
          ...(origemAcao?.ok ? [`/planos/${origemAcao.origem.planoId}`] : []),
        ];
        return { id: demanda.id, caminhos };
      }),
    );
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/demandas");
  criada.caminhos.forEach((c) => revalidatePath(c));
  redirect(`/demandas/${criada.id}`);
}

const esquemaTramite = z.discriminatedUnion("acao", [
  z.object({ acao: z.literal("analisar"), demandaId: z.uuid() }),
  z.object({ acao: z.literal("concluir"), demandaId: z.uuid(), texto: textoOpcional }),
  z.object({
    acao: z.literal("devolver"),
    demandaId: z.uuid(),
    texto: textoObrigatorio("Explique o que precisa ser complementado."),
    novoPrazo: z.union([dataFutura, z.literal("").transform(() => undefined)]).optional(),
  }),
  z.object({ acao: z.literal("cancelar"), demandaId: z.uuid(), texto: textoObrigatorio("Informe o motivo do cancelamento.") }),
  z.object({ acao: z.literal("deferir"), demandaId: z.uuid(), novoPrazo: dataFutura, texto: textoOpcional }),
  z.object({ acao: z.literal("indeferir"), demandaId: z.uuid(), texto: textoObrigatorio("Informe o motivo do indeferimento.") }),
  z.object({
    acao: z.literal("comentar"),
    demandaId: z.uuid(),
    texto: textoObrigatorio("Escreva o comentário."),
    visivelUnidade: z.literal("on").optional(),
  }),
]);

type Transicao = { de: StatusDemanda[]; para?: StatusDemanda; tipo: TipoTramite; log: string; mensagem: string };

const TRANSICOES: Record<z.infer<typeof esquemaTramite>["acao"], Transicao> = {
  analisar: { de: ["RESPONDIDA"], para: "EM_ANALISE", tipo: "ANALISE", log: "demanda.em_analise", mensagem: "Resposta em análise." },
  concluir: {
    de: ["RESPONDIDA", "EM_ANALISE"],
    para: "CONCLUIDA",
    tipo: "CONCLUSAO",
    log: "demanda.concluida",
    mensagem: "Resposta aceita e demanda concluída.",
  },
  devolver: {
    de: ["RESPONDIDA", "EM_ANALISE"],
    para: "DEVOLVIDA",
    tipo: "DEVOLUCAO",
    log: "demanda.devolvida",
    mensagem: "Demanda devolvida para complementação.",
  },
  cancelar: { de: STATUS_ABERTOS, para: "CANCELADA", tipo: "CANCELAMENTO", log: "demanda.cancelada", mensagem: "Demanda cancelada." },
  deferir: {
    de: STATUS_ABERTOS,
    tipo: "PRORROGACAO_DEFERIDA",
    log: "demanda.prorrogacao_deferida",
    mensagem: "Prorrogação deferida e prazo atualizado.",
  },
  indeferir: {
    de: STATUS_ABERTOS,
    tipo: "PRORROGACAO_INDEFERIDA",
    log: "demanda.prorrogacao_indeferida",
    mensagem: "Prorrogação indeferida.",
  },
  comentar: {
    de: [...STATUS_ABERTOS, "CONCLUIDA", "CANCELADA"],
    tipo: "COMENTARIO",
    log: "demanda.comentada",
    mensagem: "Comentário registrado.",
  },
};

const ACEITA_ANEXOS = new Set(["concluir", "devolver", "comentar"]);

export async function tramitarDemanda(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaTramite.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const entrada = dados.data;
  const regra = TRANSICOES[entrada.acao];
  const arquivos = ACEITA_ANEXOS.has(entrada.acao) ? arquivosDoFormulario(formData) : [];

  let evidencias: Awaited<ReturnType<typeof vincularEvidenciasDaResposta>> | undefined;
  try {
    evidencias = await comArquivos(ctx.clienteId, arquivos, (salvos) =>
      comCliente(ctx, async (tx) => {
        const demanda = await travarDemanda(tx, entrada.demandaId);
        if (!demanda) throw new ErroNegocio("Demanda não encontrada.");
        if (!regra.de.includes(demanda.status)) {
          throw new ErroNegocio("A situação atual da demanda não permite esta ação. Atualize a página.");
        }

        let novoPrazo: Date | undefined;
        let pedidoId: string | undefined;
        if (entrada.acao === "deferir" || entrada.acao === "indeferir") {
          const pedido = await buscarProrrogacaoPendente(tx, demanda.id);
          if (!pedido) throw new ErroNegocio("Não há pedido de prorrogação pendente.");
          pedidoId = pedido.id;
          if (entrada.acao === "deferir") {
            if (entrada.novoPrazo <= demanda.prazo) throw new ErroNegocio("O novo prazo deve ser posterior ao prazo atual.");
            novoPrazo = entrada.novoPrazo;
          }
        }
        if (entrada.acao === "devolver") novoPrazo = entrada.novoPrazo;

        if (regra.para || novoPrazo) {
          await tx.demanda.update({
            where: { id: demanda.id },
            data: { ...(regra.para && { status: regra.para }), ...(novoPrazo && { prazo: novoPrazo }) },
            select: { id: true },
          });
        }

        const texto = "texto" in entrada ? entrada.texto : undefined;
        const interno = entrada.acao === "comentar" && !entrada.visivelUnidade;
        const tramite = await tx.tramitacaoDemanda.create({
          data: {
            clienteId: ctx.clienteId,
            demandaId: demanda.id,
            tipo: regra.tipo,
            statusAnterior: regra.para ? demanda.status : null,
            statusNovo: regra.para ?? null,
            texto,
            novoPrazo,
            interno,
            usuarioId: ctx.usuarioId,
            usuarioNome: ctx.usuario.nome,
          },
          select: { id: true },
        });
        await registrarDocumentos(tx, ctx, salvos, { demandaId: demanda.id, tramiteId: tramite.id });
        const vinculadas = entrada.acao === "concluir" ? await vincularEvidenciasDaResposta(tx, demanda) : undefined;
        await registrarLog(tx, ctx.clienteId, {
          acao: regra.log,
          usuarioId: ctx.usuarioId,
          entidade: "Demanda",
          entidadeId: demanda.id,
          dados: {
            numero: numeroDemanda(demanda.numero, demanda.ano),
            ...(regra.para && { de: demanda.status, para: regra.para }),
            ...(novoPrazo && { prazoAnterior: demanda.prazo.toISOString().slice(0, 10), novoPrazo: novoPrazo.toISOString().slice(0, 10) }),
            ...(pedidoId && { pedidoProrrogacaoId: pedidoId }),
            ...(entrada.acao === "comentar" && { interno }),
            anexos: salvos.length,
            ...(vinculadas && !!(demanda.respostaRequisitoId || demanda.acaoId) && { evidencias: vinculadas.quantidade, ...vinculadas.vinculo }),
          },
        });
        return vinculadas;
      }),
    );
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath(`/demandas/${entrada.demandaId}`);
  revalidatePath("/demandas");
  evidencias?.caminhos.forEach((c) => revalidatePath(c));
  if (evidencias?.quantidade) revalidatePath("/documentos");
  return { ok: true, mensagem: [regra.mensagem, ...(evidencias ? mensagemEvidencias(evidencias) : [])].join(" ") };
}

function mensagemEvidencias({ quantidade, vinculo, recusas }: Awaited<ReturnType<typeof vincularEvidenciasDaResposta>>) {
  const destinos = [vinculo.respostaRequisitoId && "do requisito", vinculo.acaoId && "da ação"].filter(Boolean).join(" e ");
  const partes: string[] = [];
  if (quantidade && destinos) {
    partes.push(quantidade === 1 ? `1 documento virou evidência ${destinos}.` : `${quantidade} documentos viraram evidência ${destinos}.`);
  }
  if (recusas.length) partes.push(`Sem vínculo de evidência: ${recusas.join(" ")}`);
  return partes;
}
