"use server";

import { revalidatePath } from "next/cache";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";
import { anoValido, LIMITE_SECAO_ANUAL, SECOES_ANUAL, type SecoesAnual } from "@/lib/relatorios/anual-secoes";

export async function salvarRelatorioAnual(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const ano = Number(formData.get("ano"));
  if (!anoValido(ano)) return { erro: "Exercício inválido." };

  const secoes: SecoesAnual = {};
  for (const { chave, titulo } of SECOES_ANUAL) {
    const valor = String(formData.get(chave) ?? "").replace(/\r\n/g, "\n").trim();
    if (valor.length > LIMITE_SECAO_ANUAL) {
      return { erro: `"${titulo}" passou do limite de ${LIMITE_SECAO_ANUAL.toLocaleString("pt-BR")} caracteres.` };
    }
    if (valor) secoes[chave] = valor;
  }

  try {
    await comCliente(ctx, async (tx) => {
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
        dados: { ano, secoesPreenchidas: Object.keys(secoes) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath(`/relatorios/anual/${ano}`);
  return { ok: true, mensagem: "Textos do relatório anual salvos." };
}
