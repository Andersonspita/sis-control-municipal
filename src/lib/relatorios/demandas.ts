import "server-only";
import { comCliente } from "@/lib/db";
import { diasAte } from "@/lib/datas";
import { estaVencida, numeroDemanda, STATUS_ABERTOS } from "@/lib/demandas";
import { PRIORIDADE, STATUS_DEMANDA } from "@/lib/rotulos";
import { html } from "@/lib/pdf/html";
import type { Prisma } from "@/generated/prisma/client";
import {
  dataOuTraco,
  descreverPeriodo,
  exigirControle,
  inteiro,
  kpis,
  meta,
  nomeArquivo,
  rotuloUnidade,
  selo,
  vazio,
  type ContextoRelatorio,
  type RelatorioMontado,
} from "./comum";

const DIA_MS = 86_400_000;
/** Meia-noite em Salvador (UTC−3) para filtrar timestamps por data civil. */
const FUSO_MS = 3 * 60 * 60 * 1000;

export type FiltrosRelatorioDemandas = { inicio?: Date; fim?: Date; unidadeId?: string };

function formatarDias(valor: number | null) {
  if (valor === null) return "—";
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${valor === 1 ? "dia" : "dias"}`;
}

function media(valores: number[]) {
  return valores.length ? Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10 : null;
}

/** Relatório de demandas: atendidas, vencidas, em aberto e tempo médio de resposta por unidade (criação no período). */
export async function montarRelatorioDemandas(
  ctx: ContextoRelatorio,
  filtros: FiltrosRelatorioDemandas,
): Promise<RelatorioMontado> {
  exigirControle(ctx);
  const criadoEm: Prisma.DateTimeFilter = {};
  if (filtros.inicio) criadoEm.gte = new Date(filtros.inicio.getTime() + FUSO_MS);
  if (filtros.fim) criadoEm.lt = new Date(filtros.fim.getTime() + DIA_MS + FUSO_MS);
  const where: Prisma.DemandaWhereInput = {
    ...(filtros.inicio || filtros.fim ? { criadoEm } : {}),
    ...(filtros.unidadeId ? { unidadeDestinoId: filtros.unidadeId } : {}),
  };

  const { demandas, unidade } = await comCliente(ctx, async (tx) => ({
    demandas: await tx.demanda.findMany({
      where,
      orderBy: [{ ano: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        numero: true,
        ano: true,
        assunto: true,
        prazo: true,
        prioridade: true,
        status: true,
        criadoEm: true,
        unidadeDestino: { select: { id: true, nome: true, sigla: true } },
        tramites: {
          where: { tipo: "RESPOSTA" },
          orderBy: { criadoEm: "asc" },
          take: 1,
          select: { criadoEm: true },
        },
      },
    }),
    unidade: filtros.unidadeId
      ? await tx.unidade.findUnique({ where: { id: filtros.unidadeId }, select: { nome: true, sigla: true } })
      : null,
  }));

  const linhas = demandas.map((d) => {
    const resposta = d.tramites[0]?.criadoEm ?? null;
    const prazoFim = d.prazo.getTime() + DIA_MS + FUSO_MS;
    return {
      ...d,
      vencida: estaVencida(d),
      aberta: STATUS_ABERTOS.includes(d.status),
      atendida: d.status === "CONCLUIDA",
      diasResposta: resposta ? Math.max(0, (resposta.getTime() - d.criadoEm.getTime()) / DIA_MS) : null,
      respondidaNoPrazo: resposta ? resposta.getTime() < prazoFim : null,
    };
  });

  const porUnidade = new Map<string, { rotulo: string; itens: typeof linhas }>();
  for (const l of linhas) {
    const g = porUnidade.get(l.unidadeDestino.id) ?? { rotulo: rotuloUnidade(l.unidadeDestino), itens: [] };
    g.itens.push(l);
    porUnidade.set(l.unidadeDestino.id, g);
  }
  const grupos = [...porUnidade.values()].sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  const respondidas = linhas.filter((l) => l.diasResposta !== null);
  const noPrazo = respondidas.filter((l) => l.respondidaNoPrazo).length;
  const pendentes = linhas.filter((l) => l.aberta).sort((a, b) => a.prazo.getTime() - b.prazo.getTime());
  const periodo = descreverPeriodo(filtros.inicio, filtros.fim);

  const corpo = html`
<h1>Relatório de Demandas</h1>
<p class="subtitulo">Demandas criadas no período: ${periodo}</p>
${meta([
  { rotulo: "Período", valor: periodo },
  { rotulo: "Unidade", valor: unidade ? rotuloUnidade(unidade) : "Todas" },
])}
${kpis([
  { rotulo: "Demandas no período", valor: inteiro(linhas.length) },
  { rotulo: "Atendidas (concluídas)", valor: inteiro(linhas.filter((l) => l.atendida).length) },
  { rotulo: "Em aberto", valor: inteiro(pendentes.length) },
  { rotulo: "Vencidas", valor: inteiro(linhas.filter((l) => l.vencida).length) },
  { rotulo: "Canceladas", valor: inteiro(linhas.filter((l) => l.status === "CANCELADA").length) },
  { rotulo: "Tempo médio até a 1ª resposta", valor: formatarDias(media(respondidas.map((l) => l.diasResposta!))) },
  { rotulo: "Respondidas no prazo", valor: respondidas.length ? `${Math.round((noPrazo / respondidas.length) * 100)}%` : "—" },
  { rotulo: "Unidades demandadas", valor: inteiro(grupos.length) },
])}

<h2>1. Resultado por unidade</h2>
${
  grupos.length
    ? html`<table><thead><tr><th>Unidade</th><th class="num">Total</th><th class="num">Atendidas</th><th class="num">Em aberto</th><th class="num">Vencidas</th><th class="num">Respondidas no prazo</th><th class="num">Tempo médio de resposta</th></tr></thead>
<tbody>${grupos.map((g) => {
        const resp = g.itens.filter((l) => l.diasResposta !== null);
        return html`<tr><td>${g.rotulo}</td><td class="num">${g.itens.length}</td>
<td class="num">${g.itens.filter((l) => l.atendida).length}</td>
<td class="num">${g.itens.filter((l) => l.aberta).length}</td>
<td class="num">${g.itens.filter((l) => l.vencida).length}</td>
<td class="num">${resp.length ? `${resp.filter((l) => l.respondidaNoPrazo).length} de ${resp.length}` : "—"}</td>
<td class="num">${formatarDias(media(resp.map((l) => l.diasResposta!)))}</td></tr>`;
      })}</tbody></table>`
    : vazio("Nenhuma demanda no período.")
}
<p class="nota">Tempo de resposta: do envio da demanda até a primeira resposta da unidade. "Vencida": prazo anterior a hoje sem conclusão ou cancelamento.</p>

<h2>2. Demandas em aberto</h2>
${
  pendentes.length
    ? html`<table><thead><tr><th style="width:10%">Número</th><th>Assunto</th><th style="width:22%">Unidade</th><th style="width:10%">Prioridade</th><th style="width:11%">Prazo</th><th style="width:14%">Situação</th></tr></thead>
<tbody>${pendentes.map((l) => {
        const dias = diasAte(l.prazo);
        return html`<tr><td>${numeroDemanda(l.numero, l.ano)}</td><td>${l.assunto}</td><td>${rotuloUnidade(l.unidadeDestino)}</td>
<td>${PRIORIDADE[l.prioridade]}</td>
<td>${dataOuTraco(l.prazo)}${l.vencida ? html`<br><span class="selo critico">${-dias} dia(s) de atraso</span>` : null}</td>
<td>${selo(STATUS_DEMANDA[l.status])}</td></tr>`;
      })}</tbody></table>`
    : vazio("Nenhuma demanda em aberto.")
}
`;

  return {
    tipo: "demandas",
    titulo: "Relatório de Demandas",
    arquivo: nomeArquivo("demandas", unidade?.sigla ?? unidade?.nome, filtros.inicio?.toISOString().slice(0, 10), filtros.fim?.toISOString().slice(0, 10)),
    corpo,
    filtros: {
      inicio: filtros.inicio?.toISOString().slice(0, 10) ?? null,
      fim: filtros.fim?.toISOString().slice(0, 10) ?? null,
      unidadeId: filtros.unidadeId ?? null,
    },
  };
}
