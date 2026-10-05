import "server-only";
import type { ContextoCliente, Tx } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { validarConjunto } from "@/lib/arquivos";
import { removerArquivo, salvarArquivo, type ArquivoArmazenado } from "@/lib/armazenamento";
import { ErroArquivo } from "@/lib/erros";

export type VinculoDocumento = {
  demandaId?: string;
  tramiteId?: string;
  acaoId?: string;
  respostaRequisitoId?: string;
};

export function arquivosDoFormulario(formData: FormData, campo = "anexos"): File[] {
  return formData.getAll(campo).filter((v): v is File => v instanceof File && v.size > 0 && v.name !== "");
}

/**
 * Grava os arquivos no armazenamento e executa `fn` (a transação no banco).
 * Se `fn` falhar, os arquivos enviados são removidos para não deixar órfãos.
 */
export async function comArquivos<T>(
  clienteId: string,
  arquivos: File[],
  fn: (salvos: ArquivoArmazenado[]) => Promise<T>,
): Promise<T> {
  const erro = validarConjunto(arquivos);
  if (erro) throw new ErroArquivo(erro);
  const salvos: ArquivoArmazenado[] = [];
  try {
    for (const a of arquivos) {
      salvos.push(await salvarArquivo(clienteId, a.name, Buffer.from(await a.arrayBuffer())));
    }
    return await fn(salvos);
  } catch (err) {
    await Promise.all(salvos.map((s) => removerArquivo(s.storageKey)));
    throw err;
  }
}

/** Registra os documentos já armazenados e grava um log por documento (rastreabilidade LGPD). */
export async function registrarDocumentos(
  tx: Tx,
  ctx: ContextoCliente,
  salvos: ArquivoArmazenado[],
  vinculo: VinculoDocumento = {},
) {
  if (!salvos.length) return [];
  const docs = await tx.documento.createManyAndReturn({
    data: salvos.map((s) => ({ ...s, ...vinculo, clienteId: ctx.clienteId, enviadoPorId: ctx.usuarioId })),
    select: { id: true, nome: true, tamanho: true, sha256: true },
  });
  for (const d of docs) {
    await registrarLog(tx, ctx.clienteId, {
      acao: "documento.enviado",
      usuarioId: ctx.usuarioId,
      entidade: "Documento",
      entidadeId: d.id,
      dados: { nome: d.nome, tamanho: d.tamanho, sha256: d.sha256, ...vinculo },
    });
  }
  return docs;
}