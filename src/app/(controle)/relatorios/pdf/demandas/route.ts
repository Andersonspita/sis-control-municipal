import type { NextRequest } from "next/server";
import { montarRelatorioDemandas } from "@/lib/relatorios/demandas";
import { dataOpcional, uuidOpcional } from "@/lib/relatorios/comum";
import { responderPdf } from "@/lib/relatorios/rota";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const filtros = {
    inicio: dataOpcional.parse(q.get("inicio") ?? undefined),
    fim: dataOpcional.parse(q.get("fim") ?? undefined),
    unidadeId: uuidOpcional.parse(q.get("unidade") ?? undefined),
  };
  return responderPdf((c) => montarRelatorioDemandas(c, filtros));
}
