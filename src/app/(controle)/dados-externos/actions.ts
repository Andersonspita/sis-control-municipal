"use server";

import { revalidatePath } from "next/cache";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { agendarSincronizacao } from "@/lib/dados/integracoes";
import { cnpjValido, normalizarCnpj } from "@/lib/documentos-br";
import { mensagemDeErro } from "@/lib/erros";
import { mensagemIntegracao } from "@/lib/integracoes/http";
import { chavePortal, consultarSancoes, MENSAGEM_SEM_CHAVE } from "@/lib/integracoes/portal-transparencia";
import type { SancaoResumo } from "@/lib/integracoes/tipos";
import type { EstadoAcao } from "@/lib/acoes";

export async function sincronizarDadosExternos(): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (ctx.perfil !== "CONTROLADOR" && !ctx.usuario.adminHorizon) {
    return { erro: "Somente o controlador pode atualizar os dados externos." };
  }
  try {
    const iniciou = await agendarSincronizacao(ctx, "MANUAL");
    if (!iniciou) return { erro: "Já há uma atualização em andamento. Aguarde a conclusão." };
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidatePath("/dados-externos");
  return { ok: true, mensagem: "Atualização iniciada. Os cartões são atualizados assim que cada fonte responder." };
}

export type EstadoSancoes = { erro?: string; cnpj?: string; sancoes?: SancaoResumo[] } | undefined;

export async function consultarSancoesCnpj(_: EstadoSancoes, formData: FormData): Promise<EstadoSancoes> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const cnpj = normalizarCnpj(String(formData.get("cnpj") ?? ""));
  if (!cnpjValido(cnpj)) return { erro: "Informe um CNPJ válido." };
  const chave = chavePortal();
  if (!chave) return { erro: MENSAGEM_SEM_CHAVE };

  try {
    const sancoes = await consultarSancoes(cnpj, { chave });
    await comCliente(ctx, (tx) =>
      registrarLog(tx, ctx.clienteId, {
        acao: "integracoes.sancoes_consultadas",
        usuarioId: ctx.usuarioId,
        entidade: "CNPJ",
        entidadeId: cnpj,
        dados: { ceis: sancoes.filter((s) => s.cadastro === "CEIS").length, cnep: sancoes.filter((s) => s.cadastro === "CNEP").length },
      }),
    );
    return { cnpj, sancoes };
  } catch (err) {
    return { erro: mensagemIntegracao(err) };
  }
}
