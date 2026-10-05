import type { NextRequest } from "next/server";
import { montarRelatorioAuditoria } from "@/lib/relatorios/auditoria";
import { responderPdf } from "@/lib/relatorios/rota";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const auditoriaId = q.get("id") ?? "";
  const pedida = q.get("versao");
  const versao = pedida === "preliminar" || pedida === "final" ? pedida : undefined;
  return responderPdf((c) => montarRelatorioAuditoria(c, { auditoriaId, versao }));
}
