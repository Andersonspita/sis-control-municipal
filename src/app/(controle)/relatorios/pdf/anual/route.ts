import type { NextRequest } from "next/server";
import { montarRelatorioAnual } from "@/lib/relatorios/anual";
import { responderPdf } from "@/lib/relatorios/rota";

export async function GET(request: NextRequest) {
  const ano = Number(request.nextUrl.searchParams.get("ano"));
  return responderPdf(
    (c) => montarRelatorioAnual(c, { ano }),
    (tx, c) => tx.relatorioAnual.updateMany({ where: { clienteId: c.clienteId, ano }, data: { emitidoEm: new Date() } }),
  );
}
