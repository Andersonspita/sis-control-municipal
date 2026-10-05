import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { obterContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { lerArquivo } from "@/lib/armazenamento";
import { categoriaPorMime } from "@/lib/arquivos";

function contentDisposition(tipo: "inline" | "attachment", nome: string) {
  const ascii = nome.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "_") || "arquivo";
  return `${tipo}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`;
}

export async function GET(request: NextRequest, ctx: RouteContext<"/arquivos/[id]">) {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return new NextResponse("Documento não encontrado.", { status: 404 });

  const contexto = await obterContexto();
  if (!contexto) return new NextResponse("Acesso não autorizado.", { status: 401 });

  // RLS garante o isolamento por cliente e o escopo do satélite (unidade e trâmites não internos).
  const doc = await comCliente(contexto, async (tx) => {
    const d = await tx.documento.findUnique({
      where: { id },
      select: { id: true, nome: true, mimeType: true, tamanho: true, storageKey: true, demandaId: true },
    });
    if (!d) return null;
    await registrarLog(tx, contexto.clienteId, {
      acao: "documento.baixado",
      usuarioId: contexto.usuarioId,
      entidade: "Documento",
      entidadeId: d.id,
      dados: { nome: d.nome, perfil: contexto.perfil, demandaId: d.demandaId },
    });
    return d;
  });
  if (!doc) return new NextResponse("Documento não encontrado.", { status: 404 });

  let corpo: ReadableStream<Uint8Array>;
  try {
    corpo = await lerArquivo(doc.storageKey);
  } catch (err) {
    console.error("Arquivo indisponível no armazenamento", doc.id, err);
    return new NextResponse("Arquivo indisponível no momento.", { status: 503 });
  }

  const categoria = categoriaPorMime(doc.mimeType);
  const visualizar =
    request.nextUrl.searchParams.get("visualizar") === "1" && (categoria === "pdf" || categoria === "imagem");

  return new NextResponse(corpo, {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.tamanho),
      "Content-Disposition": contentDisposition(visualizar ? "inline" : "attachment", doc.nome),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
