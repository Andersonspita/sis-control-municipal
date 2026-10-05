"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE, type Contexto } from "@/lib/auth/dal";
import { mensagemDeErro } from "@/lib/erros";
import { processarAnalise, solicitarAnalise, type PedidoAnalise } from "@/lib/ia/analises";
import { aceitarSugestao, rejeitarSugestao, type EdicaoSugestao } from "@/lib/ia/revisao";

export type ResultadoIA = { ok: true; mensagem: string } | { ok: false; erro: string };

function revalidarIA(cicloId?: string | null) {
  revalidatePath("/ia");
  revalidatePath("/documentos", "layout");
  if (cicloId) revalidatePath(`/autoavaliacao/${cicloId}`);
}

/** Enfileira a análise e a processa depois da resposta (after), para não prender a tela do controlador. */
async function enfileirar(ctx: Contexto, pedido: PedidoAnalise): Promise<ResultadoIA> {
  try {
    const id = await solicitarAnalise(ctx, pedido);
    const contexto = { clienteId: ctx.clienteId, usuarioId: ctx.usuarioId, perfil: ctx.perfil };
    after(() => processarAnalise(contexto, id));
    revalidarIA(pedido.tipo === "COMPARAR_NORMA" ? pedido.cicloId : null);
    return { ok: true, mensagem: "Análise enviada. As sugestões aparecem no painel da IA quando o processamento terminar." };
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "Não foi possível solicitar a análise.") };
  }
}

const esquemaComparacao = z.object({ cicloId: z.uuid(), documentoIds: z.array(z.uuid()).min(1).max(10) });

export async function compararDocumentoComNorma(entrada: z.input<typeof esquemaComparacao>): Promise<ResultadoIA> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaComparacao.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: "Escolha o documento e o ciclo de autoavaliação." };
  return enfileirar(ctx, { tipo: "COMPARAR_NORMA", ...dados.data });
}

export async function avaliarEvidenciaComIA(respostaRequisitoId: string): Promise<ResultadoIA> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(respostaRequisitoId).success) return { ok: false, erro: "Requisito inválido." };
  return enfileirar(ctx, { tipo: "AVALIAR_EVIDENCIA", respostaRequisitoId });
}

export async function aceitarSugestaoIA(sugestaoId: string, edicao?: EdicaoSugestao): Promise<ResultadoIA> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(sugestaoId).success) return { ok: false, erro: "Sugestão inválida." };
  try {
    const r = await aceitarSugestao(ctx, sugestaoId, edicao);
    revalidarIA(r.cicloId);
    revalidatePath("/painel");
    return { ok: true, mensagem: r.status === "EDITADA" ? "Resposta aplicada com a sua edição." : "Sugestão aceita e resposta aplicada." };
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "Não foi possível aplicar a sugestão.") };
  }
}

export async function rejeitarSugestaoIA(sugestaoId: string, motivo?: string): Promise<ResultadoIA> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(sugestaoId).success) return { ok: false, erro: "Sugestão inválida." };
  try {
    await rejeitarSugestao(ctx, sugestaoId, motivo);
    revalidarIA();
    return { ok: true, mensagem: "Sugestão rejeitada. Nada foi aplicado." };
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err, "Não foi possível rejeitar a sugestão.") };
  }
}
