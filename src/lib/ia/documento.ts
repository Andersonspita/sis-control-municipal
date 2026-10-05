import "server-only";
import { comCliente, type ContextoCliente, type Tx } from "@/lib/db";
import { lerArquivo } from "@/lib/armazenamento";
import type { Prisma } from "@/generated/prisma/client";
import { mascararDadosPessoais, somarContagens } from "./mascaramento";
import { dividirEmTrechos, extrairTexto } from "./texto";
import type { ProvedorIA } from "./provedor";
import type { TrechoRef } from "./citacoes";

/** Literal aceito pelo pgvector ('[0.1,0.2,...]'), passado como parâmetro e convertido com ::vector. */
export function literalVetor(v: number[]) {
  return `[${v.map((x) => (Number.isFinite(x) ? x : 0)).join(",")}]`;
}

async function lerConteudo(storageKey: string) {
  return Buffer.from(await new Response(await lerArquivo(storageKey)).arrayBuffer());
}

export type ResultadoPreparo = { documentoId: string; status: "CONCLUIDA" | "SEM_TEXTO"; trechos: number; tokens: number; reaproveitado: boolean };

/**
 * Extrai o texto, mascara os dados pessoais, divide em trechos e grava os embeddings.
 * Reaproveita a extração já concluída com o mesmo modelo de embeddings. A leitura do arquivo e as
 * chamadas à IA ficam fora da transação (que só grava o resultado).
 */
export async function prepararDocumento(
  ctx: ContextoCliente,
  documentoId: string,
  provedor: ProvedorIA,
  modeloEmbeddings: string,
): Promise<ResultadoPreparo> {
  const doc = await comCliente(ctx, (tx) =>
    tx.documento.findUnique({
      where: { id: documentoId },
      select: { id: true, nome: true, mimeType: true, storageKey: true, extracao: { select: { status: true, modeloEmbeddings: true } } },
    }),
  );
  if (!doc) throw new Error("Documento não encontrado.");
  const ex = doc.extracao;
  if (ex?.status === "SEM_TEXTO" || (ex?.status === "CONCLUIDA" && ex.modeloEmbeddings === modeloEmbeddings)) {
    const trechos = await comCliente(ctx, (tx) => tx.trechoDocumento.count({ where: { documentoId } }));
    return { documentoId, status: ex.status, trechos, tokens: 0, reaproveitado: true };
  }

  await gravarExtracao(ctx, documentoId, { status: "PROCESSANDO", erro: null });
  try {
    const extraido = await extrairTexto(await lerConteudo(doc.storageKey), doc.mimeType, doc.nome);
    if (!extraido.ok) {
      await comCliente(ctx, async (tx) => {
        await tx.trechoDocumento.deleteMany({ where: { documentoId } });
        await gravarExtracaoTx(tx, ctx, documentoId, { status: "SEM_TEXTO", erro: extraido.motivo, processadoEm: new Date() });
      });
      return { documentoId, status: "SEM_TEXTO", trechos: 0, tokens: 0, reaproveitado: false };
    }

    const mascarados = extraido.paginas.map(mascararDadosPessoais);
    const trechos = dividirEmTrechos(
      mascarados.map((m) => m.texto),
      { paginado: extraido.paginado },
    );
    const { vetores, tokens } = trechos.length ? await provedor.embeddings(trechos.map((t) => t.texto), modeloEmbeddings) : { vetores: [], tokens: 0 };

    await comCliente(
      ctx,
      async (tx) => {
        await tx.trechoDocumento.deleteMany({ where: { documentoId } });
        for (let i = 0; i < trechos.length; i++) {
          const t = trechos[i];
          await tx.$executeRaw`
            INSERT INTO trechos_documento (id, cliente_id, documento_id, ordem, pagina, posicao, texto, embedding)
            VALUES (gen_random_uuid(), ${ctx.clienteId}::uuid, ${documentoId}::uuid, ${t.ordem}, ${t.pagina}, ${t.posicao}, ${t.texto}, ${literalVetor(vetores[i])}::vector)`;
        }
        await gravarExtracaoTx(tx, ctx, documentoId, {
          status: trechos.length ? "CONCLUIDA" : "SEM_TEXTO",
          paginas: extraido.paginas.length,
          caracteres: mascarados.reduce((s, m) => s + m.texto.length, 0),
          mascaramentos: somarContagens(mascarados.map((m) => m.contagem)),
          modeloEmbeddings,
          tokens,
          erro: trechos.length ? null : "Documento sem texto.",
          processadoEm: new Date(),
        });
      },
      { timeout: 60_000 },
    );
    return { documentoId, status: trechos.length ? "CONCLUIDA" : "SEM_TEXTO", trechos: trechos.length, tokens, reaproveitado: false };
  } catch (err) {
    await gravarExtracao(ctx, documentoId, { status: "ERRO", erro: err instanceof Error ? err.message.slice(0, 500) : "Falha na extração." }).catch(() => {});
    throw err;
  }
}

type DadosExtracao = Omit<Prisma.ExtracaoDocumentoUncheckedCreateInput, "clienteId" | "documentoId">;

async function gravarExtracaoTx(tx: Tx, ctx: ContextoCliente, documentoId: string, dados: DadosExtracao) {
  await tx.extracaoDocumento.upsert({
    where: { documentoId },
    create: { ...dados, clienteId: ctx.clienteId, documentoId },
    update: dados,
  });
}

function gravarExtracao(ctx: ContextoCliente, documentoId: string, dados: DadosExtracao) {
  return comCliente(ctx, (tx) => gravarExtracaoTx(tx, ctx, documentoId, dados));
}

type LinhaTrecho = { id: string; documento_id: string; ordem: number; pagina: number | null; texto: string };

/** Trechos mais próximos (distância de cosseno) de cada vetor de consulta, nos documentos indicados. */
export async function buscarTrechos(
  tx: Tx,
  documentos: { id: string; nome: string }[],
  consulta: number[],
  limite: number,
): Promise<Omit<TrechoRef, "ref">[]> {
  const nomes = new Map(documentos.map((d) => [d.id, d.nome]));
  const ids = documentos.map((d) => d.id);
  const linhas = await tx.$queryRaw<LinhaTrecho[]>`
    SELECT id, documento_id, ordem, pagina, texto
      FROM trechos_documento
     WHERE documento_id = ANY(${ids}::uuid[]) AND embedding IS NOT NULL
     ORDER BY embedding <=> ${literalVetor(consulta)}::vector, ordem
     LIMIT ${limite}`;
  return linhas.map((l) => ({
    id: l.id,
    documentoId: l.documento_id,
    documentoNome: nomes.get(l.documento_id) ?? "Documento",
    pagina: l.pagina,
    texto: l.texto,
  }));
}
