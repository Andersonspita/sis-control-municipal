import "server-only";
import { comCliente } from "@/lib/db";
import { estaVencida, STATUS_ABERTOS as DEMANDAS_ABERTAS } from "@/lib/demandas";
import { numeroAuditoria } from "@/lib/auditorias";
import { classificarRisco, NIVEIS_RISCO, NIVEL_RISCO } from "@/lib/risco";
import { ORIGEM_PLANO, STATUS_AUDITORIA, STATUS_CICLO, STATUS_PLANO_AUDITORIA, TIPO_AUDITORIA } from "@/lib/rotulos";
import { calcularConformidade, formatarPercentual } from "@/lib/dados/conformidade";
import { acaoVencida, dataIso, STATUS_ABERTOS as ACOES_ABERTAS } from "@/lib/dados/acoes";
import { hojeComoDataSimples } from "@/lib/datas";
import { html, paragrafos } from "@/lib/pdf/html";
import type { OrigemPlano } from "@/generated/prisma/client";
import { anoValido, lerSecoesAnual, SECOES_ANUAL, type ChaveSecaoAnual, type SecoesAnual } from "./anual-secoes";
import {
  assinante,
  blocoAssinatura,
  dadosEntidade,
  dataOuTraco,
  exigirControle,
  inteiro,
  kpis,
  localEData,
  nomeArquivo,
  rotuloUnidade,
  selo,
  vazio,
  type ContextoRelatorio,
  type RelatorioMontado,
} from "./comum";

const DIA_MS = 86_400_000;

/** Textos salvos do relatório do ano (null = ainda não editado). */
export async function carregarRelatorioAnual(ctx: ContextoRelatorio, ano: number) {
  exigirControle(ctx);
  const r = await comCliente(ctx, (tx) =>
    tx.relatorioAnual.findUnique({
      where: { clienteId_ano: { clienteId: ctx.clienteId, ano } },
      select: { secoes: true, atualizadoEm: true, atualizadoPorId: true, emitidoEm: true },
    }),
  );
  return r ? { ...r, secoes: lerSecoesAnual(r.secoes) } : null;
}

function secaoTexto(numero: number, chave: ChaveSecaoAnual, secoes: SecoesAnual) {
  const s = SECOES_ANUAL.find((x) => x.chave === chave)!;
  return html`<h2>${numero}. ${s.titulo}</h2>${paragrafos(secoes[chave], "Seção não preenchida pelo controlador.")}`;
}

/** Relatório Anual de Controle Interno (art. 17 da Res. TCM-BA 1.120/2005): números do ano + textos do controlador. */
export async function montarRelatorioAnual(ctx: ContextoRelatorio, params: { ano: number }): Promise<RelatorioMontado | null> {
  exigirControle(ctx);
  const { ano } = params;
  if (!anoValido(ano)) return null;
  const inicio = new Date(Date.UTC(ano, 0, 1));
  const fim = new Date(Date.UTC(ano + 1, 0, 1));
  const noAno = { gte: inicio, lt: fim };

  const dados = await comCliente(ctx, async (tx) => ({
    relatorio: await tx.relatorioAnual.findUnique({
      where: { clienteId_ano: { clienteId: ctx.clienteId, ano } },
      select: { secoes: true },
    }),
    ciclos: await tx.cicloAvaliacao.findMany({
      where: { dataInicio: noAno, status: { not: "ARQUIVADO" } },
      orderBy: { dataInicio: "asc" },
      select: {
        nome: true,
        status: true,
        dataInicio: true,
        norma: { select: { codigo: true } },
        unidade: { select: { nome: true, sigla: true } },
        respostas: { select: { situacao: true, requisito: { select: { peso: true } } } },
      },
    }),
    paai: await tx.planoAnualAuditoria.findUnique({
      where: { clienteId_ano: { clienteId: ctx.clienteId, ano } },
      select: { status: true, _count: { select: { itens: true } } },
    }),
    auditorias: await tx.auditoria.findMany({
      where: { ano },
      orderBy: { numero: "asc" },
      select: {
        numero: true,
        ano: true,
        titulo: true,
        tipo: true,
        status: true,
        itemPlanoId: true,
        unidade: { select: { nome: true, sigla: true } },
        achados: { select: { _count: { select: { recomendacoes: true } } } },
      },
    }),
    situacoes: await tx.situacao.findMany({ where: { ano }, select: { probabilidade: true, impacto: true, status: true } }),
    demandas: await tx.demanda.findMany({
      where: { criadoEm: noAno },
      select: {
        status: true,
        prazo: true,
        criadoEm: true,
        tramites: { where: { tipo: "RESPOSTA" }, orderBy: { criadoEm: "asc" }, take: 1, select: { criadoEm: true } },
      },
    }),
    acoes: await tx.acao.findMany({
      where: { OR: [{ criadoEm: noAno }, { prazo: noAno }] },
      select: { status: true, percentual: true, prazo: true, plano: { select: { origem: true } } },
    }),
  }));
  const [entidade, quem] = await Promise.all([dadosEntidade(ctx.clienteId), assinante(ctx)]);
  const secoes = lerSecoesAnual(dados.relatorio?.secoes);
  const hoje = dataIso(hojeComoDataSimples());

  const auditoriasRealizadas = dados.auditorias.filter((a) => a.status !== "CANCELADA");
  const doPaai = auditoriasRealizadas.filter((a) => a.itemPlanoId).length;
  const situacoes = dados.situacoes.map((s) => ({ ...s, nivel: classificarRisco(s.probabilidade, s.impacto) }));
  const respondidas = dados.demandas
    .map((d) => (d.tramites[0] ? (d.tramites[0].criadoEm.getTime() - d.criadoEm.getTime()) / DIA_MS : null))
    .filter((v): v is number => v !== null);
  const tempoMedio = respondidas.length ? respondidas.reduce((s, v) => s + v, 0) / respondidas.length : null;
  const origens = [...new Set(dados.acoes.map((a) => a.plano.origem))] as OrigemPlano[];

  const corpo = html`
<h1>Relatório Anual de Controle Interno — Exercício ${ano}</h1>
<p class="subtitulo">${entidade.nome} · Art. 17 da Resolução TCM-BA nº 1.120/2005</p>

${secaoTexto(1, "apresentacao", secoes)}
${secaoTexto(2, "estrutura", secoes)}

<h2>3. Autoavaliação do controle interno</h2>
${
  dados.ciclos.length
    ? html`<table><thead><tr><th>Ciclo</th><th style="width:12%">Norma</th><th style="width:20%">Alcance</th><th style="width:12%">Início</th><th style="width:13%">Situação</th><th class="num" style="width:13%">Conformidade</th></tr></thead>
<tbody>${dados.ciclos.map((c) => {
        const r = calcularConformidade(c.respostas.map((x) => ({ situacao: x.situacao, peso: x.requisito.peso })));
        return html`<tr><td>${c.nome}</td><td>${c.norma.codigo}</td><td>${rotuloUnidade(c.unidade, "Entidade inteira")}</td>
<td>${dataOuTraco(c.dataInicio)}</td><td>${STATUS_CICLO[c.status]}</td><td class="num"><strong>${formatarPercentual(r.indice)}</strong></td></tr>`;
      })}</tbody></table>
<p class="nota">Conformidade ponderada pelo peso dos requisitos (Atende = 1; Parcial = 0,5; Não atende = 0).</p>`
    : vazio("Nenhum ciclo de autoavaliação iniciado no exercício.")
}

<h2>4. Auditorias realizadas</h2>
${kpis([
  { rotulo: "PAAI do exercício", valor: dados.paai ? STATUS_PLANO_AUDITORIA[dados.paai.status] : "Não elaborado" },
  { rotulo: "Auditorias previstas no PAAI", valor: inteiro(dados.paai?._count.itens ?? 0) },
  { rotulo: "Auditorias do exercício", valor: `${auditoriasRealizadas.length} (${doPaai} do PAAI)` },
  { rotulo: "Achados registrados", valor: inteiro(auditoriasRealizadas.reduce((s, a) => s + a.achados.length, 0)) },
])}
${
  dados.auditorias.length
    ? html`<table><thead><tr><th style="width:10%">Número</th><th>Título</th><th style="width:13%">Tipo</th><th style="width:18%">Alcance</th><th style="width:14%">Situação</th><th class="num" style="width:8%">Achados</th><th class="num" style="width:10%">Recomend.</th></tr></thead>
<tbody>${dados.auditorias.map(
        (a) => html`<tr><td>${numeroAuditoria(a.numero, a.ano)}</td><td>${a.titulo}</td><td>${TIPO_AUDITORIA[a.tipo]}</td>
<td>${rotuloUnidade(a.unidade, "Entidade inteira")}</td><td>${selo(STATUS_AUDITORIA[a.status])}</td>
<td class="num">${a.achados.length}</td><td class="num">${a.achados.reduce((s, x) => s + x._count.recomendacoes, 0)}</td></tr>`,
      )}</tbody></table>`
    : vazio("Nenhuma auditoria registrada no exercício.")
}

<h2>5. Medidas (situações que exigiram intervenção)</h2>
${
  situacoes.length
    ? html`<table><thead><tr><th>Gravidade</th><th class="num">Registradas</th><th class="num">Em aberto</th><th class="num">Resolvidas</th><th class="num">Arquivadas</th></tr></thead>
<tbody>${NIVEIS_RISCO.map((n) => {
        const g = situacoes.filter((s) => s.nivel === n);
        return html`<tr><td>${NIVEL_RISCO[n]}</td><td class="num">${g.length}</td>
<td class="num">${g.filter((s) => s.status === "ABERTA" || s.status === "EM_TRATAMENTO").length}</td>
<td class="num">${g.filter((s) => s.status === "RESOLVIDA").length}</td><td class="num">${g.filter((s) => s.status === "ARQUIVADA").length}</td></tr>`;
      })}</tbody></table>`
    : vazio("Nenhuma situação registrada no exercício.")
}

<h2>6. Demandas às unidades</h2>
${kpis([
  { rotulo: "Demandas expedidas", valor: inteiro(dados.demandas.length) },
  { rotulo: "Atendidas (concluídas)", valor: inteiro(dados.demandas.filter((d) => d.status === "CONCLUIDA").length) },
  { rotulo: "Em aberto / vencidas", valor: `${dados.demandas.filter((d) => DEMANDAS_ABERTAS.includes(d.status)).length} / ${dados.demandas.filter(estaVencida).length}` },
  { rotulo: "Tempo médio até a 1ª resposta", valor: tempoMedio === null ? "—" : `${tempoMedio.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} dias` },
])}

<h2>7. Planos de ação</h2>
${
  dados.acoes.length
    ? html`<table><thead><tr><th>Origem do plano</th><th class="num">Ações</th><th class="num">Concluídas</th><th class="num">Em andamento</th><th class="num">Vencidas</th><th class="num">Canceladas</th></tr></thead>
<tbody>${origens.map((o) => {
        const g = dados.acoes.filter((a) => a.plano.origem === o);
        return html`<tr><td>${ORIGEM_PLANO[o]}</td><td class="num">${g.length}</td><td class="num">${g.filter((a) => a.status === "CONCLUIDA").length}</td>
<td class="num">${g.filter((a) => ACOES_ABERTAS.includes(a.status)).length}</td><td class="num">${g.filter((a) => acaoVencida(a, hoje)).length}</td>
<td class="num">${g.filter((a) => a.status === "CANCELADA").length}</td></tr>`;
      })}</tbody></table>
<p class="nota">Ações criadas no exercício ou com prazo nele.</p>`
    : vazio("Nenhuma ação de plano criada ou com prazo no exercício.")
}

${secaoTexto(8, "metas", secoes)}
${secaoTexto(9, "gestao", secoes)}
${secaoTexto(10, "recomendacoes", secoes)}
${secaoTexto(11, "conclusao", secoes)}

${blocoAssinatura(quem, localEData(entidade.municipio, entidade.uf))}
`;

  return {
    tipo: "anual",
    titulo: `Relatório Anual de Controle Interno — ${ano}`,
    arquivo: nomeArquivo("relatorio-anual-controle-interno", ano),
    corpo,
    filtros: { ano },
  };
}
