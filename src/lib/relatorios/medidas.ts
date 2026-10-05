import "server-only";
import { comCliente } from "@/lib/db";
import { classificarRisco, ESCALA, IMPACTO, NIVEIS_RISCO, NIVEL_RISCO, PROBABILIDADE, type NivelRisco } from "@/lib/risco";
import { ORIGEM_SITUACAO, STATUS_PLANO, STATUS_SITUACAO } from "@/lib/rotulos";
import { percentualExecutado } from "@/lib/dados/acoes";
import { html } from "@/lib/pdf/html";
import type { StatusSituacao } from "@/generated/prisma/client";
import {
  dataOuTraco,
  exigirControle,
  inteiro,
  kpis,
  meta,
  nomeArquivo,
  rotuloUnidade,
  SELECAO_ACAO_5W2H,
  selo,
  seloNivel,
  tabelaAcoes,
  vazio,
  type ContextoRelatorio,
  type RelatorioMontado,
} from "./comum";

const STATUS: StatusSituacao[] = ["ABERTA", "EM_TRATAMENTO", "RESOLVIDA", "ARQUIVADA"];
const EM_ABERTO: StatusSituacao[] = ["ABERTA", "EM_TRATAMENTO"];

// Mesmo formato de src/lib/dados/medidas.ts, que não é importado aqui por depender das telas de Medidas.
function numeroSituacao(numero: number, ano: number) {
  return `${String(numero).padStart(3, "0")}/${ano}`;
}

export function matrizHtml(matriz: number[][], legenda: string) {
  return html`<table class="matriz">
<caption class="nota" style="caption-side:bottom;text-align:left;padding-top:1mm">${legenda}</caption>
<tbody>${[...ESCALA].reverse().map(
    (p) => html`<tr><th class="eixo">${p} · ${PROBABILIDADE[p]}</th>${ESCALA.map((i) => {
      const n = matriz[p - 1]?.[i - 1] ?? 0;
      return html`<td class="celula ${classificarRisco(p, i).toLowerCase()}">${n || ""}</td>`;
    })}</tr>`,
  )}
<tr><th class="eixo">Probabilidade / Impacto</th>${ESCALA.map((i) => html`<th class="eixo-x">${i}<br>${IMPACTO[i]}</th>`)}</tr>
</tbody></table>`;
}

/** Painel de medidas: situações por gravidade e status, matriz 5×5 das abertas e ações vinculadas. */
export async function montarRelatorioMedidas(
  ctx: ContextoRelatorio,
  filtros: { unidadeId?: string },
): Promise<RelatorioMontado> {
  exigirControle(ctx);
  const { situacoes, unidade } = await comCliente(ctx, async (tx) => ({
    situacoes: await tx.situacao.findMany({
      where: filtros.unidadeId ? { unidadeId: filtros.unidadeId } : undefined,
      orderBy: [{ ano: "desc" }, { numero: "desc" }],
      select: {
        id: true,
        numero: true,
        ano: true,
        titulo: true,
        origem: true,
        probabilidade: true,
        impacto: true,
        status: true,
        criadoEm: true,
        unidade: { select: { nome: true, sigla: true } },
        plano: {
          select: {
            titulo: true,
            status: true,
            acoes: { orderBy: [{ prazo: { sort: "asc", nulls: "last" } }, { criadoEm: "asc" }], select: SELECAO_ACAO_5W2H },
          },
        },
      },
    }),
    unidade: filtros.unidadeId
      ? await tx.unidade.findUnique({ where: { id: filtros.unidadeId }, select: { nome: true, sigla: true } })
      : null,
  }));

  const linhas = situacoes.map((s) => ({ ...s, nivel: classificarRisco(s.probabilidade, s.impacto) }));
  const abertas = linhas.filter((s) => EM_ABERTO.includes(s.status));
  const matriz = ESCALA.map(() => ESCALA.map(() => 0));
  for (const s of abertas) matriz[s.probabilidade - 1][s.impacto - 1]++;
  const contar = (nivel: NivelRisco, status: StatusSituacao) =>
    linhas.filter((s) => s.nivel === nivel && s.status === status).length;
  const comPlano = abertas.filter((s) => s.plano);

  const corpo = html`
<h1>Painel de Medidas</h1>
<p class="subtitulo">Situações que exigem intervenção da controladoria, fora da conformidade normativa</p>
${meta([{ rotulo: "Unidade", valor: unidade ? rotuloUnidade(unidade) : "Todas" }])}
${kpis([
  { rotulo: "Situações registradas", valor: inteiro(linhas.length) },
  { rotulo: "Em aberto", valor: inteiro(abertas.length) },
  { rotulo: "Críticas ou altas em aberto", valor: inteiro(abertas.filter((s) => s.nivel === "CRITICO" || s.nivel === "ALTO").length) },
  { rotulo: "Em aberto sem plano de ação", valor: inteiro(abertas.length - comPlano.length) },
])}

<h2>1. Situações por gravidade e status</h2>
<table><thead><tr><th>Gravidade</th>${STATUS.map((s) => html`<th class="num">${STATUS_SITUACAO[s]}</th>`)}<th class="num">Total</th></tr></thead>
<tbody>${NIVEIS_RISCO.map(
    (n) => html`<tr><td>${seloNivel(n)}</td>${STATUS.map((s) => html`<td class="num">${contar(n, s)}</td>`)}
<td class="num"><strong>${linhas.filter((s) => s.nivel === n).length}</strong></td></tr>`,
  )}</tbody></table>

<h2>2. Matriz de gravidade (situações em aberto)</h2>
${matrizHtml(matriz, "Quantidade de situações abertas ou em tratamento por probabilidade (linhas) e impacto (colunas). Gravidade = probabilidade × impacto.")}
<p class="nota">${NIVEIS_RISCO.map((n) => `${NIVEL_RISCO[n]}: ${abertas.filter((s) => s.nivel === n).length}`).join(" · ")}</p>

<h2>3. Situações</h2>
${
  linhas.length
    ? html`<table><thead><tr><th style="width:10%">Número</th><th>Título</th><th style="width:15%">Origem</th><th style="width:18%">Unidade</th><th style="width:10%">Gravidade</th><th style="width:12%">Status</th><th class="num" style="width:10%">Plano</th></tr></thead>
<tbody>${linhas.map(
        (s) => html`<tr><td>${numeroSituacao(s.numero, s.ano)}</td><td>${s.titulo}<br><span class="nota">Registrada em ${dataOuTraco(s.criadoEm)}</span></td>
<td>${ORIGEM_SITUACAO[s.origem]}</td><td>${rotuloUnidade(s.unidade)}</td>
<td>${seloNivel(s.nivel)}<br><span class="nota">${s.probabilidade} × ${s.impacto} = ${s.probabilidade * s.impacto}</span></td>
<td>${selo(STATUS_SITUACAO[s.status])}</td>
<td class="num">${s.plano ? `${percentualExecutado(s.plano.acoes) ?? 0}%` : "—"}</td></tr>`,
      )}</tbody></table>`
    : vazio("Nenhuma situação registrada.")
}

<h2>4. Ações vinculadas às situações em aberto</h2>
${
  comPlano.length
    ? comPlano.map(
        (s) => html`<h3>${numeroSituacao(s.numero, s.ano)} — ${s.titulo}</h3>
<p class="nota">${s.plano!.titulo} · ${STATUS_PLANO[s.plano!.status]} · ${s.plano!.acoes.length} ação(ões)</p>
${tabelaAcoes(s.plano!.acoes)}`,
      )
    : vazio("Nenhuma situação em aberto com plano de ação.")
}
`;

  return {
    tipo: "medidas",
    titulo: "Painel de Medidas",
    arquivo: nomeArquivo("painel-medidas", unidade?.sigla ?? unidade?.nome),
    corpo,
    filtros: { unidadeId: filtros.unidadeId ?? null },
  };
}
