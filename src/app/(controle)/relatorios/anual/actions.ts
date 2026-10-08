"use server";

import { revalidatePath } from "next/cache";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";
import { anoValido, lerSecoesAnual, LIMITE_SECAO_ANUAL, SECOES_ANUAL, type SecoesAnual } from "@/lib/relatorios/anual-secoes";
import { somenteDiferentesDoSistema, somentePersonalizadas } from "@/lib/relatorios/anual-padrao";

/** Lê as seções do formulário, validando o tamanho. */
function lerFormulario(formData: FormData): { secoes: SecoesAnual } | { erro: string } {
  const secoes: SecoesAnual = {};
  for (const { chave, titulo } of SECOES_ANUAL) {
    const valor = String(formData.get(chave) ?? "").replace(/\r\n/g, "\n").trim();
    if (valor.length > LIMITE_SECAO_ANUAL) {
      return { erro: `"${titulo}" passou do limite de ${LIMITE_SECAO_ANUAL.toLocaleString("pt-BR")} caracteres.` };
    }
    if (valor) secoes[chave] = valor;
  }
  return { secoes };
}

/**
 * Textos de um exercício. Só as seções diferentes do texto padrão são gravadas como personalização
 * do ano; as demais continuam seguindo o padrão (inclusive alterações futuras dele).
 */
export async function salvarRelatorioAnual(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const ano = Number(formData.get("ano"));
  if (!anoValido(ano)) return { erro: "Exercício inválido." };
  const lido = lerFormulario(formData);
  if ("erro" in lido) return lido;

  let personalizadas: string[] = [];
  try {
    await comCliente(ctx, async (tx) => {
      const modelo = await tx.modeloRelatorioAnual.findUnique({ where: { clienteId: ctx.clienteId }, select: { secoes: true } });
      const secoes = somentePersonalizadas(lido.secoes, lerSecoesAnual(modelo?.secoes));
      personalizadas = Object.keys(secoes);
      const r = await tx.relatorioAnual.upsert({
        where: { clienteId_ano: { clienteId: ctx.clienteId, ano } },
        create: { clienteId: ctx.clienteId, ano, secoes, atualizadoPorId: ctx.usuarioId },
        update: { secoes, atualizadoPorId: ctx.usuarioId },
        select: { id: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "relatorio_anual.salvo",
        usuarioId: ctx.usuarioId,
        entidade: "RelatorioAnual",
        entidadeId: r.id,
        dados: { ano, secoesPersonalizadas: personalizadas },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath(`/relatorios/anual/${ano}`);
  return {
    ok: true,
    mensagem: personalizadas.length
      ? `Textos de ${ano} salvos (${personalizadas.length} seção(ões) personalizada(s) para o exercício).`
      : `Textos de ${ano} salvos: o exercício segue integralmente o texto padrão.`,
  };
}

/** Texto padrão do relatório anual, aplicado a todos os exercícios sem personalização. */
export async function salvarModeloAnual(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const lido = lerFormulario(formData);
  if ("erro" in lido) return lido;
  const secoes = somenteDiferentesDoSistema(lido.secoes);

  try {
    await comCliente(ctx, async (tx) => {
      const m = await tx.modeloRelatorioAnual.upsert({
        where: { clienteId: ctx.clienteId },
        create: { clienteId: ctx.clienteId, secoes, atualizadoPorId: ctx.usuarioId },
        update: { secoes, atualizadoPorId: ctx.usuarioId },
        select: { id: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "relatorio_anual.padrao_salvo",
        usuarioId: ctx.usuarioId,
        entidade: "ModeloRelatorioAnual",
        entidadeId: m.id,
        dados: { secoesAlteradas: Object.keys(secoes) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/relatorios/anual", "layout");
  return { ok: true, mensagem: "Texto padrão do relatório anual salvo. Vale para todos os exercícios sem personalização." };
}
