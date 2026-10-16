import type { Prisma } from "../../generated/prisma/client";
import { anoDaNumeracao, proximoNumeroSituacao } from "../numeracao-situacao";
import { calcularAlertasFiscais, type AlertaFiscal } from "./alertas-fiscais";
import type { DadosSiconfi, Poder } from "./tipos";

// Alertas automáticos: a cada coleta do SICONFI, os alertas fiscais viram situações (origem ALERTA) sem
// ação do controlador, são atualizados quando sai um novo demonstrativo e encerrados quando a irregularidade
// deixa de constar. Sem "server-only": roda na coleta disparada pela tela (after()) e no cron.

type Tx = Prisma.TransactionClient;

const ABERTAS = ["ABERTA", "EM_TRATAMENTO"] as const;

export type AlertaAutomaticoAplicado = {
  id: string;
  numero: number;
  ano: number;
  titulo: string;
  chave: string;
  probabilidade: number;
  impacto: number;
};

export type ResultadoAlertasAutomaticos = {
  criados: AlertaAutomaticoAplicado[];
  atualizados: AlertaAutomaticoAplicado[];
  encerrados: AlertaAutomaticoAplicado[];
};

/**
 * Alertas que geram situação automaticamente para o cliente. A Câmara (Legislativo) recebe os do próprio
 * Poder (despesa com pessoal e entregas); os indicadores do ente (dívida, mínimos, meta fiscal) ficam com o Executivo.
 */
export function alertasParaAutomatizar(dados: DadosSiconfi, entidade: string, poder: Poder, agora = new Date()): AlertaFiscal[] {
  return calcularAlertasFiscais({
    entidade,
    codigoIbge: "coletado",
    siconfi: { dados, erro: null, travada: false, coletadoEm: agora },
    agora,
  }).filter((a) => a.id !== "coleta" && a.registro && a.referenciaAutomatica && !(poder === "L" && a.doEnte));
}

function log(clienteId: string, usuarioId: string | null, acao: string, situacaoId: string, dados: Prisma.InputJsonValue) {
  return { clienteId, usuarioId, acao, entidade: "Situacao", entidadeId: situacaoId, dados };
}

const dataBr = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia" }).format(d);

/**
 * Sincroniza as situações automáticas do cliente com os dados recém-coletados do SICONFI.
 * Deve rodar na transação com o contexto de RLS do cliente, logo após gravar a coleta bem-sucedida.
 */
export async function aplicarAlertasAutomaticos(
  tx: Tx,
  opcoes: { clienteId: string; entidade: string; poder: Poder; dados: DadosSiconfi; usuarioId: string | null; agora?: Date },
): Promise<ResultadoAlertasAutomaticos> {
  const { clienteId, entidade, poder, dados, usuarioId } = opcoes;
  const agora = opcoes.agora ?? new Date();
  const alertas = alertasParaAutomatizar(dados, entidade, poder, agora);
  const resultado: ResultadoAlertasAutomaticos = { criados: [], atualizados: [], encerrados: [] };
  const logs: Prisma.LogAuditoriaCreateManyInput[] = [];

  // Serializa com outra coleta do mesmo cliente (o índice parcial único é a última barreira).
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`alertas-automaticos:${clienteId}`}, 0))`;
  const abertas = await tx.situacao.findMany({
    where: { clienteId, chaveAutomatica: { not: null }, status: { in: [...ABERTAS] } },
    select: { id: true, numero: true, ano: true, titulo: true, chaveAutomatica: true, referenciaAutomatica: true, probabilidade: true, impacto: true },
  });

  for (const alerta of alertas) {
    const r = alerta.registro!;
    const referencia = alerta.referenciaAutomatica!.slice(0, 500);
    const aberta = abertas.find((s) => s.chaveAutomatica === alerta.id);

    if (aberta) {
      const mudou = aberta.referenciaAutomatica !== referencia || aberta.probabilidade !== r.probabilidade || aberta.impacto !== r.impacto;
      if (!mudou) continue;
      await tx.situacao.update({
        where: { id: aberta.id },
        data: { titulo: r.titulo.slice(0, 200), descricao: r.descricao, probabilidade: r.probabilidade, impacto: r.impacto, referenciaAutomatica: referencia },
      });
      logs.push(
        log(clienteId, usuarioId, "situacao.atualizada_automaticamente", aberta.id, {
          de: { referencia: aberta.referenciaAutomatica, probabilidade: aberta.probabilidade, impacto: aberta.impacto },
          para: { referencia, probabilidade: r.probabilidade, impacto: r.impacto },
        }),
      );
      resultado.atualizados.push({ ...aberta, titulo: r.titulo, chave: alerta.id, probabilidade: r.probabilidade, impacto: r.impacto });
      continue;
    }

    // O controlador já encerrou o alerta deste mesmo demonstrativo: não recria.
    const encerradaPeloControlador = await tx.situacao.findFirst({
      where: { clienteId, chaveAutomatica: alerta.id, referenciaAutomatica: referencia, encerradoPorId: { not: null } },
      select: { id: true },
    });
    if (encerradaPeloControlador) continue;

    const ano = anoDaNumeracao(agora);
    const numero = await proximoNumeroSituacao(tx, clienteId, ano);
    const criada = await tx.situacao.create({
      data: {
        clienteId,
        numero,
        ano,
        titulo: r.titulo.slice(0, 200),
        descricao: r.descricao,
        origem: "ALERTA",
        probabilidade: r.probabilidade,
        impacto: r.impacto,
        criadoPorId: null,
        chaveAutomatica: alerta.id,
        referenciaAutomatica: referencia,
      },
      select: { id: true },
    });
    logs.push(
      log(clienteId, usuarioId, "situacao.criada_automaticamente", criada.id, {
        numero: `${String(numero).padStart(3, "0")}/${ano}`,
        titulo: r.titulo,
        chave: alerta.id,
        referencia,
        probabilidade: r.probabilidade,
        impacto: r.impacto,
      }),
    );
    resultado.criados.push({ id: criada.id, numero, ano, titulo: r.titulo, chave: alerta.id, probabilidade: r.probabilidade, impacto: r.impacto });
  }

  const vigentes = new Set(alertas.map((a) => a.id));
  for (const s of abertas) {
    if (vigentes.has(s.chaveAutomatica as AlertaFiscal["id"])) continue;
    const justificativa =
      `Encerrado automaticamente: a coleta do SICONFI de ${dataBr(agora)} não aponta mais esta irregularidade` +
      `${s.referenciaAutomatica ? ` (último registro: ${s.referenciaAutomatica.split(",").length > 1 ? "entregas pendentes regularizadas" : s.referenciaAutomatica})` : ""}.`;
    await tx.situacao.update({
      where: { id: s.id },
      data: { status: "RESOLVIDA", encerradoEm: agora, encerradoPorId: null, justificativaEncerramento: justificativa },
    });
    logs.push(log(clienteId, usuarioId, "situacao.encerrada_automaticamente", s.id, { justificativa }));
    resultado.encerrados.push({ ...s, chave: s.chaveAutomatica! });
  }

  // createMany: a política de leitura da trilha não deixa o INSERT ... RETURNING do create passar.
  if (logs.length) await tx.logAuditoria.createMany({ data: logs });
  return resultado;
}
