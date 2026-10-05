"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { notificarDemanda } from "@/lib/email/notificar";
import { arquivosDoFormulario, comArquivos, registrarDocumentos } from "@/lib/documentos";
import { buscarProrrogacaoPendente, travarDemanda } from "@/lib/dados/demandas";
import { formatarDataSimples, hojeComoDataSimples } from "@/lib/datas";
import { numeroDemanda, STATUS_AGUARDANDO_UNIDADE } from "@/lib/demandas";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";

function revalidar(id: string) {
  revalidatePath("/satelite");
  revalidatePath("/satelite/painel");
  revalidatePath(`/satelite/demandas/${id}`);
}

/** Primeira abertura pela unidade: ENVIADA → VISUALIZADA. Idempotente. */
export async function marcarVisualizada(demandaId: string) {
  const ctx = await exigirContexto(["SATELITE"]);
  if (!z.uuid().safeParse(demandaId).success) return;
  const marcou = await comCliente(ctx, async (tx) => {
    const { count } = await tx.demanda.updateMany({ where: { id: demandaId, status: "ENVIADA" }, data: { status: "VISUALIZADA" } });
    if (count === 0) return false;
    const d = await tx.demanda.findUniqueOrThrow({ where: { id: demandaId }, select: { numero: true, ano: true } });
    await tx.tramitacaoDemanda.create({
      data: {
        clienteId: ctx.clienteId,
        demandaId,
        tipo: "VISUALIZACAO",
        statusAnterior: "ENVIADA",
        statusNovo: "VISUALIZADA",
        usuarioId: ctx.usuarioId,
        usuarioNome: ctx.usuario.nome,
      },
      select: { id: true },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "demanda.visualizada",
      usuarioId: ctx.usuarioId,
      entidade: "Demanda",
      entidadeId: demandaId,
      dados: { numero: numeroDemanda(d.numero, d.ano) },
    });
    return true;
  });
  if (marcou) revalidar(demandaId);
}

const esquemaResposta = z.object({
  demandaId: z.uuid(),
  texto: z.string().trim().min(3, { error: "Escreva a resposta." }).max(10000),
});

export async function responderDemanda(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(["SATELITE"]);
  const dados = esquemaResposta.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { demandaId, texto } = dados.data;

  try {
    await comArquivos(ctx.clienteId, arquivosDoFormulario(formData), (salvos) =>
      comCliente(ctx, async (tx) => {
        const d = await travarDemanda(tx, demandaId);
        if (!d) throw new ErroNegocio("Demanda não encontrada.");
        if (!STATUS_AGUARDANDO_UNIDADE.includes(d.status)) {
          throw new ErroNegocio("Esta demanda não está aguardando resposta. Atualize a página.");
        }
        await tx.demanda.update({ where: { id: d.id }, data: { status: "RESPONDIDA" }, select: { id: true } });
        const tramite = await tx.tramitacaoDemanda.create({
          data: {
            clienteId: ctx.clienteId,
            demandaId: d.id,
            tipo: "RESPOSTA",
            statusAnterior: d.status,
            statusNovo: "RESPONDIDA",
            texto,
            usuarioId: ctx.usuarioId,
            usuarioNome: ctx.usuario.nome,
          },
          select: { id: true },
        });
        await registrarDocumentos(tx, ctx, salvos, { demandaId: d.id, tramiteId: tramite.id });
        await registrarLog(tx, ctx.clienteId, {
          acao: "demanda.respondida",
          usuarioId: ctx.usuarioId,
          entidade: "Demanda",
          entidadeId: d.id,
          dados: { numero: numeroDemanda(d.numero, d.ano), de: d.status, para: "RESPONDIDA", anexos: salvos.length },
        });
      }),
    );
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  notificarDemanda(ctx, demandaId, "respondida");
  revalidar(demandaId);
  return { ok: true, mensagem: "Resposta enviada à controladoria." };
}

const esquemaProrrogacao = z.object({
  demandaId: z.uuid(),
  novoPrazo: z.iso.date({ error: "Informe a nova data." }).transform((v) => new Date(v)),
  texto: z.string().trim().min(10, { error: "Explique por que precisa de mais prazo (mínimo de 10 caracteres)." }).max(5000),
});

export async function pedirProrrogacao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(["SATELITE"]);
  const dados = esquemaProrrogacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { demandaId, novoPrazo, texto } = dados.data;

  try {
    await comCliente(ctx, async (tx) => {
      const d = await travarDemanda(tx, demandaId);
      if (!d) throw new ErroNegocio("Demanda não encontrada.");
      if (!STATUS_AGUARDANDO_UNIDADE.includes(d.status)) {
        throw new ErroNegocio("Só é possível pedir prorrogação enquanto a demanda aguarda resposta.");
      }
      if (novoPrazo <= d.prazo || novoPrazo < hojeComoDataSimples()) {
        throw new ErroNegocio("A nova data deve ser posterior ao prazo atual.");
      }
      if (await buscarProrrogacaoPendente(tx, d.id)) {
        throw new ErroNegocio("Já existe um pedido de prorrogação aguardando decisão.");
      }
      await tx.tramitacaoDemanda.create({
        data: {
          clienteId: ctx.clienteId,
          demandaId: d.id,
          tipo: "PRORROGACAO_SOLICITADA",
          texto,
          novoPrazo,
          usuarioId: ctx.usuarioId,
          usuarioNome: ctx.usuario.nome,
        },
        select: { id: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "demanda.prorrogacao_solicitada",
        usuarioId: ctx.usuarioId,
        entidade: "Demanda",
        entidadeId: d.id,
        dados: {
          numero: numeroDemanda(d.numero, d.ano),
          prazoAtual: d.prazo.toISOString().slice(0, 10),
          novoPrazo: novoPrazo.toISOString().slice(0, 10),
        },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  notificarDemanda(ctx, demandaId, "prorrogacao_solicitada", formatarDataSimples(novoPrazo));
  revalidar(demandaId);
  return { ok: true, mensagem: "Pedido de prorrogação enviado à controladoria." };
}
