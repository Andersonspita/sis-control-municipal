import type { NextRequest } from "next/server";
import { montarRelatorioAutoavaliacao } from "@/lib/relatorios/autoavaliacao";
import { uuidOpcional } from "@/lib/relatorios/comum";
import { responderPdf } from "@/lib/relatorios/rota";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const cicloId = q.get("ciclo") ?? "";
  const unidadeId = uuidOpcional.parse(q.get("unidade") ?? undefined);
  return responderPdf((c) => montarRelatorioAutoavaliacao(c, { cicloId, unidadeId }));
}
