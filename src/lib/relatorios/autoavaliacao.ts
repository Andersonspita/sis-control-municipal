import "server-only";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import { MACROFUNCAO, SITUACAO_REQUISITO, STATUS_CICLO, STATUS_PLANO } from "@/lib/rotulos";
import {
  calcularConformidade,
  chavesMacrofuncao,
  conformidadePorGrupo,
  formatarPercentual,
  GERA_ACAO,
  mapaCapitulos,
  percentual,
  TRANSVERSAL,
  type GrupoConformidade,
} from "@/lib/dados/conformidade";
import { percentualExecutado } from "@/lib/dados/acoes";
import { html, paragrafos } from "@/lib/pdf/html";
import type { Macrofuncao } from "@/generated/prisma/client";
import {
  barra,
  dataOuTraco,
  exigirControle,
  inteiro,
  kpis,
  meta,
  nomeArquivo,
  rotuloUnidade,
  SELECAO_ACAO_5W2H,
  selo,
  tabelaAcoes,
  vazio,
  type ContextoRelatorio,
  type RelatorioMontado,
} from "./comum";

function tabelaGrupos(titulo: string, grupos: { rotulo: string; g: GrupoConformidade }[]) {
  if (!grupos.length) return vazio("Sem requisitos avaliados.");
  return html`<table>
<thead><tr><th>${titulo}</th><th class="num">Atende</th><th class="num">Parcial</th><th class="num">Não atende</th><th class="num">N/A</th><th class="num">Não avaliado</th><th class="num" style="width:12%">Conformidade</th><th style="width:16%"></th></tr></thead>
<tbody>${grupos.map(
    ({ rotulo, g }) => html`<tr><td>${rotulo}</td>
<td class="num">${g.contagem.ATENDIDO}</td><td class="num">${g.contagem.PARCIALMENTE_ATENDIDO}</td>
<td class="num">${g.contagem.NAO_ATENDIDO}</td><td class="num">${g.contagem.NAO_APLICAVEL}</td>
<td class="num">${g.contagem.NAO_AVALIADO}</td><td class="num"><strong>${formatarPercentual(g.indice)}</strong></td>
<td>${barra(percentual(g.indice))}</td></tr>`,
  )}</tbody></table>`;
}

/** Relatório da autoavaliação com plano de ação. `unidadeId` filtra as ações pela unidade responsável. */
export async function montarRelatorioAutoavaliacao(
  ctx: ContextoRelatorio,
  params: { cicloId: string; unidadeId?: string },
): Promise<RelatorioMontado | null> {
  exigirControle(ctx);
  if (!z.uuid().safeParse(params.cicloId).success) return null;
  const dados = await comCliente(ctx, async (tx) => {
    const ciclo = await tx.cicloAvaliacao.findUnique({
      where: { id: params.cicloId },
      select: {
        id: true,
        nome: true,
        status: true,
        dataInicio: true,
        dataFim: true,
        concluidoEm: true,
        normaId: true,
        norma: { select: { codigo: true, titulo: true } },
        unidade: { select: { nome: true, sigla: true } },
        respostas: {
          select: {
            situacao: true,
            observacao: true,
            requisito: { select: { id: true, codigo: true, titulo: true, peso: true, macrofuncoes: true, ordem: true } },
          },
        },
        planos: {
          where: { status: { not: "CANCELADO" } },
          orderBy: { criadoEm: "asc" },
          select: {
            id: true,
            titulo: true,
            status: true,
            acoes: {
              where: params.unidadeId ? { unidadeResponsavelId: params.unidadeId } : undefined,
              orderBy: [{ prazo: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }],
              select: { ...SELECAO_ACAO_5W2H, respostaRequisito: { select: { requisito: { select: { codigo: true } } } } },
            },
          },
        },
      },
    });
    const unidade = params.unidadeId
      ? await tx.unidade.findUnique({ where: { id: params.unidadeId }, select: { nome: true, sigla: true } })
      : null;
    return ciclo ? { ciclo, unidade } : null;
  });
  if (!dados) return null;
  const { ciclo, unidade } = dados;

  const nos = await db.requisito.findMany({
    where: { normaId: ciclo.normaId },
    select: { id: true, paiId: true, codigo: true, titulo: true, ordem: true },
  });
  const capitulos = mapaCapitulos(nos);
  const porId = new Map(nos.map((n) => [n.id, n]));

  const itens = ciclo.respostas.map((r) => ({
    situacao: r.situacao,
    peso: r.requisito.peso,
    capitulo: capitulos.get(r.requisito.id) ?? r.requisito.id,
    macro: r.requisito.macrofuncoes,
  }));
  const geral = calcularConformidade(itens);
  const porCapitulo = [...conformidadePorGrupo(itens, (i) => i.capitulo).values()]
    .map((g) => ({ g, no: porId.get(g.chave) }))
    .sort((a, b) => (a.no?.ordem ?? 0) - (b.no?.ordem ?? 0))
    .map(({ g, no }) => ({ rotulo: no ? `${no.codigo} — ${no.titulo}` : "Sem capítulo", g }));
  const porMacro = [...conformidadePorGrupo(itens, (i) => chavesMacrofuncao(i.macro)).values()]
    .sort((a, b) => (a.chave === TRANSVERSAL ? 1 : b.chave === TRANSVERSAL ? -1 : a.chave.localeCompare(b.chave)))
    .map((g) => ({ rotulo: g.chave === TRANSVERSAL ? "Transversal (sem macrofunção)" : MACROFUNCAO[g.chave as Macrofuncao], g }));

  const pendentes = ciclo.respostas
    .filter((r) => GERA_ACAO.includes(r.situacao))
    .sort((a, b) => a.requisito.ordem - b.requisito.ordem);
  const acoes = ciclo.planos.flatMap((p) => p.acoes);

  const corpo = html`
<h1>Relatório da Autoavaliação</h1>
<p class="subtitulo">${ciclo.nome} · ${ciclo.norma.codigo} — ${ciclo.norma.titulo}</p>
${meta([
  { rotulo: "Situação do ciclo", valor: STATUS_CICLO[ciclo.status] },
  { rotulo: "Alcance", valor: rotuloUnidade(ciclo.unidade, "Entidade inteira") },
  { rotulo: "Início", valor: dataOuTraco(ciclo.dataInicio) },
  { rotulo: "Término", valor: dataOuTraco(ciclo.dataFim) },
  ...(unidade ? [{ rotulo: "Ações filtradas por", valor: rotuloUnidade(unidade) }] : []),
])}
${kpis([
  { rotulo: "Conformidade geral (ponderada)", valor: formatarPercentual(geral.indice) },
  { rotulo: "Requisitos avaliados", valor: `${inteiro(geral.avaliados)} de ${inteiro(geral.total)}` },
  { rotulo: "Não atendidos / parciais", valor: `${geral.contagem.NAO_ATENDIDO} / ${geral.contagem.PARCIALMENTE_ATENDIDO}` },
  { rotulo: "Ações no plano", valor: inteiro(acoes.length) },
])}
<p class="nota">Fórmula: Atende = 1, Atende parcialmente = 0,5, Não atende = 0, ponderados pelo peso do requisito; "Não se aplica" e "Não avaliado" ficam fora do denominador.</p>

<h2>1. Conformidade por capítulo</h2>
${tabelaGrupos("Capítulo", porCapitulo)}

<h2>2. Conformidade por macrofunção</h2>
${tabelaGrupos("Macrofunção", porMacro)}
<p class="nota">Requisitos com mais de uma macrofunção entram, com o peso inteiro, em cada uma delas.</p>

<h2>3. Requisitos não atendidos ou atendidos parcialmente</h2>
${
  pendentes.length
    ? html`<table><thead><tr><th style="width:12%">Código</th><th>Requisito</th><th style="width:14%">Situação</th><th style="width:34%">Justificativa</th></tr></thead>
<tbody>${pendentes.map(
        (r) => html`<tr><td>${r.requisito.codigo}</td><td>${r.requisito.titulo}</td>
<td>${selo(SITUACAO_REQUISITO[r.situacao])}</td><td>${r.observacao ?? "—"}</td></tr>`,
      )}</tbody></table>`
    : vazio("Nenhum requisito não atendido ou parcial.")
}

<h2>4. Plano de ação (5W2H)</h2>
${
  ciclo.planos.length
    ? ciclo.planos.map(
        (p) => html`<h3>${p.titulo}</h3>
<p class="nota">Situação do plano: ${STATUS_PLANO[p.status]} · Execução: ${percentualExecutado(p.acoes) ?? 0}% · ${p.acoes.length} ação(ões)</p>
${tabelaAcoes(p.acoes)}`,
      )
    : vazio("Nenhum plano de ação gerado a partir deste ciclo.")
}
${ciclo.status !== "CONCLUIDO" ? paragrafos("Ciclo ainda em andamento: os números refletem as respostas registradas até a emissão.") : null}
`;

  return {
    tipo: "autoavaliacao",
    titulo: `Relatório da Autoavaliação — ${ciclo.nome}`,
    arquivo: nomeArquivo("autoavaliacao", ciclo.nome),
    corpo,
    referencia: { entidade: "CicloAvaliacao", id: ciclo.id },
    filtros: { cicloId: ciclo.id, unidadeId: params.unidadeId ?? null },
  };
}
