import type { NextRequest } from "next/server";
import { montarOficioDemanda } from "@/lib/relatorios/oficio";
import { responderPdf } from "@/lib/relatorios/rota";

export async function GET(request: NextRequest) {
  const demandaId = request.nextUrl.searchParams.get("demanda") ?? "";
  return responderPdf((c) => montarOficioDemanda(c, { demandaId }));
}
