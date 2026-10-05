import type { Prisma } from "@/generated/prisma/client";
import { destinatariosControle, resolvedorSatelites } from "./destinatarios";
import { modeloEventoDemanda, type EventoDemanda } from "./modelos";
import { urlApp, type Mensagem } from "./transporte";

type Tx = Prisma.TransactionClient;

/** Eventos que avisam a controladoria; os demais avisam os satélites da unidade destinatária. */
const PARA_CONTROLE = new Set<EventoDemanda>(["respondida", "prorrogacao_solicitada"]);

/** Monta as mensagens de um evento da demanda. `tx` precisa do contexto do cliente aplicado. */
export async function mensagensEventoDemanda(
  tx: Tx,
  clienteId: string,
  demandaId: string,
  evento: EventoDemanda,
  extra?: string,
): Promise<Mensagem[]> {
  const [demanda, cliente] = await Promise.all([
    tx.demanda.findUnique({
      where: { id: demandaId },
      select: { numero: true, ano: true, assunto: true, prazo: true, unidadeDestino: { select: { id: true, nome: true } } },
    }),
    tx.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } }),
  ]);
  if (!demanda || !cliente) return [];

  const paraControle = PARA_CONTROLE.has(evento);
  const destinatarios = paraControle
    ? await destinatariosControle(tx, clienteId)
    : (await resolvedorSatelites(tx))(demanda.unidadeDestino.id);
  const conteudo = modeloEventoDemanda(
    evento,
    cliente.nome,
    {
      ...demanda,
      unidade: demanda.unidadeDestino.nome,
      link: urlApp(paraControle ? `/demandas/${demandaId}` : `/satelite/demandas/${demandaId}`),
    },
    extra,
  );
  return destinatarios.map((d) => ({ para: d.email, ...conteudo }));
}
