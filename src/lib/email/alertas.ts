import type { Prisma } from "../../generated/prisma/client";
import type { ResultadoAlertasAutomaticos } from "../integracoes/alertas-automaticos";
import { classificarRisco, NIVEL_RISCO } from "../risco";
import { destinatariosControle } from "./destinatarios";
import { modeloAlertasAutomaticos, type ItemAlertaEmail } from "./modelos";
import { urlApp, type Mensagem } from "./transporte";

// Sem "server-only": usado pela coleta automática, que roda também no cron.

/**
 * E-mails aos controladores e à equipe sobre alertas criados ou encerrados automaticamente.
 * Atualizações de alertas já abertos não geram e-mail (evita ruído a cada coleta).
 */
export async function mensagensAlertasAutomaticos(
  tx: Prisma.TransactionClient,
  clienteId: string,
  cliente: string,
  resultado: ResultadoAlertasAutomaticos,
): Promise<Mensagem[]> {
  if (!resultado.criados.length && !resultado.encerrados.length) return [];
  const item = (a: ResultadoAlertasAutomaticos["criados"][number]): ItemAlertaEmail => ({
    numero: `${String(a.numero).padStart(3, "0")}/${a.ano}`,
    titulo: a.titulo,
    gravidade: NIVEL_RISCO[classificarRisco(a.probabilidade, a.impacto)],
    link: urlApp(`/alertas/${a.id}`),
  });
  const conteudo = modeloAlertasAutomaticos({
    cliente,
    novos: resultado.criados.map(item),
    encerrados: resultado.encerrados.map(item),
    link: urlApp("/alertas"),
  });
  const destinatarios = await destinatariosControle(tx, clienteId);
  return destinatarios.map((d) => ({ para: d.email, ...conteudo }));
}
