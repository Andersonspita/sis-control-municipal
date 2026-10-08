import type { NextRequest } from "next/server";
import { montarRelatorioAlertas } from "@/lib/relatorios/alertas";
import { uuidOpcional } from "@/lib/relatorios/comum";
import { responderPdf } from "@/lib/relatorios/rota";

export async function GET(request: NextRequest) {
  const unidadeId = uuidOpcional.parse(request.nextUrl.searchParams.get("unidade") ?? undefined);
  return responderPdf((c) => montarRelatorioAlertas(c, { unidadeId }));
}
