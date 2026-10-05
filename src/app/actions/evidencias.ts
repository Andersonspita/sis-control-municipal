"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { arquivosDoFormulario, comArquivos, registrarDocumentos } from "@/lib/documentos";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import type { Anexo } from "@/components/anexos/lista-anexos";

const esquema = z.object({
  alvo: z.enum(["resposta", "acao"]),
  id: z.uuid(),
});

export type ResultadoEvidencias = { ok: true; documentos: Anexo[] } | { ok: false; erro: string };

const SELECAO = { id: true, nome: true, tamanho: true, mimeType: true } as const;

/** Anexa arquivos de evidência a uma resposta de autoavaliação ou a uma ação de plano. */
export async function anexarEvidencias(formData: FormData): Promise<ResultadoEvidencias> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquema.safeParse({ alvo: formData.get("alvo"), id: formData.get("id") });
  if (!dados.success) return { ok: false, erro: "Destino da evidência inválido." };
  const arquivos = arquivosDoFormulario(formData);
  if (arquivos.length === 0) return { ok: false, erro: "Selecione ao menos um arquivo." };
  const { alvo, id } = dados.data;

  try {
    const documentos = await comArquivos(ctx.clienteId, arquivos, (salvos) =>
      comCliente(ctx, async (tx) => {
        if (alvo === "resposta") {
          const resposta = await tx.respostaRequisito.findUnique({
            where: { id },
            select: { ciclo: { select: { status: true } } },
          });
          if (!resposta) throw new ErroNegocio("Resposta não encontrada.");
          if (resposta.ciclo.status !== "EM_ANDAMENTO") {
            throw new ErroNegocio("Ciclo encerrado: não é possível anexar novas evidências.");
          }
          await registrarDocumentos(tx, ctx, salvos, { respostaRequisitoId: id });
          return tx.documento.findMany({ where: { respostaRequisitoId: id }, orderBy: { criadoEm: "asc" }, select: SELECAO });
        }

        const acao = await tx.acao.findUnique({
          where: { id },
          select: { status: true, plano: { select: { status: true } } },
        });
        if (!acao) throw new ErroNegocio("Ação não encontrada.");
        if (acao.status === "CANCELADA" || acao.plano.status === "CANCELADO") {
          throw new ErroNegocio("Ação cancelada: não é possível anexar evidências.");
        }
        await registrarDocumentos(tx, ctx, salvos, { acaoId: id });
        return tx.documento.findMany({ where: { acaoId: id }, orderBy: { criadoEm: "asc" }, select: SELECAO });
      }),
    );
    revalidatePath("/documentos");
    return { ok: true, documentos };
  } catch (err) {
    return { ok: false, erro: mensagemDeErro(err) };
  }
}
