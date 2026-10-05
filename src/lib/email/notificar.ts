import "server-only";
import { after } from "next/server";
import { comCliente, type ContextoCliente } from "@/lib/db";
import { mensagensEventoDemanda } from "./demandas";
import { enviarEmails } from "./transporte";
import type { EventoDemanda } from "./modelos";

/**
 * Agenda o e-mail do evento para depois da resposta ao usuário, fora da transação da ação.
 * Chamar só depois que a ação foi gravada: `after` roda mesmo quando a ação falha.
 * Falhas de leitura ou de envio não chegam ao usuário; ficam registradas no console.
 */
export function notificarDemanda(ctx: ContextoCliente, demandaId: string, evento: EventoDemanda, extra?: string) {
  after(async () => {
    try {
      const mensagens = await comCliente(ctx, (tx) => mensagensEventoDemanda(tx, ctx.clienteId, demandaId, evento, extra));
      await enviarEmails(mensagens);
    } catch (err) {
      console.error(`[e-mail] Falha ao notificar "${evento}" da demanda ${demandaId}:`, err);
    }
  });
}
