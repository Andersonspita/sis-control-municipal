import "server-only";
import { NextResponse } from "next/server";
import { obterContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, type Tx } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { ErroNegocio } from "@/lib/erros";
import { gerarPdfRelatorio, type ContextoRelatorio, type RelatorioMontado } from "./comum";

function contentDisposition(nome: string) {
  return `inline; filename="${nome}.pdf"; filename*=UTF-8''${encodeURIComponent(nome)}.pdf`;
}

/**
 * Resposta padrão dos Route Handlers de relatório: só controladoria (o satélite recebe 403 antes de qualquer
 * consulta), dados via `comCliente` (RLS), emissão registrada na trilha.
 */
export async function responderPdf(
  montar: (ctx: ContextoRelatorio) => Promise<RelatorioMontado | null>,
  aposEmitir?: (tx: Tx, ctx: ContextoRelatorio) => Promise<unknown>,
) {
  const contexto = await obterContexto();
  if (!contexto) return new NextResponse("Acesso não autorizado.", { status: 401 });
  if (!PERFIS_CONTROLE.includes(contexto.perfil)) {
    return new NextResponse("Relatórios disponíveis apenas para a controladoria.", { status: 403 });
  }
  const ctx: ContextoRelatorio = {
    clienteId: contexto.clienteId,
    usuarioId: contexto.usuarioId,
    perfil: contexto.perfil,
    usuarioNome: contexto.usuario.nome,
  };

  let relatorio: RelatorioMontado | null;
  try {
    relatorio = await montar(ctx);
  } catch (err) {
    if (err instanceof ErroNegocio) return new NextResponse(err.message, { status: 400 });
    throw err;
  }
  if (!relatorio) return new NextResponse("Registro não encontrado.", { status: 404 });

  let pdf: Buffer;
  try {
    pdf = await gerarPdfRelatorio(ctx, relatorio);
  } catch (err) {
    console.error("Falha ao gerar PDF", relatorio.tipo, err);
    return new NextResponse("Não foi possível gerar o PDF no momento. Tente novamente.", { status: 503 });
  }

  await comCliente(ctx, async (tx) => {
    await registrarLog(tx, ctx.clienteId, {
      acao: relatorio.tipo === "oficio" ? "oficio.emitido" : "relatorio.emitido",
      usuarioId: ctx.usuarioId,
      entidade: relatorio.referencia?.entidade,
      entidadeId: relatorio.referencia?.id,
      dados: { tipo: relatorio.tipo, titulo: relatorio.titulo, filtros: relatorio.filtros ?? {} },
    });
    await aposEmitir?.(tx, ctx);
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Content-Disposition": contentDisposition(relatorio.arquivo),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
