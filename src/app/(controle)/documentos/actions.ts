"use server";

import { revalidatePath } from "next/cache";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { arquivosDoFormulario, comArquivos, registrarDocumentos } from "@/lib/documentos";
import { mensagemDeErro } from "@/lib/erros";
import type { EstadoAcao } from "@/lib/acoes";

export async function enviarDocumentosAvulsos(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const arquivos = arquivosDoFormulario(formData);
  if (arquivos.length === 0) return { erro: "Selecione ao menos um arquivo." };

  try {
    await comArquivos(ctx.clienteId, arquivos, (salvos) => comCliente(ctx, (tx) => registrarDocumentos(tx, ctx, salvos)));
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/documentos");
  return { ok: true, mensagem: arquivos.length === 1 ? "Documento enviado." : `${arquivos.length} documentos enviados.` };
}
