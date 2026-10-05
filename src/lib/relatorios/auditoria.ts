import "server-only";
import { z } from "zod";
import { comCliente, db } from "@/lib/db";
import { numeroAuditoria } from "@/lib/auditorias";
import { hojeComoDataSimples } from "@/lib/datas";
import { classificarRisco } from "@/lib/risco";
import { acaoVencida, dataIso, percentualExecutado } from "@/lib/dados/acoes";
import { RESULTADO_ITEM_CHECKLIST, STATUS_ACAO, STATUS_AUDITORIA, STATUS_PLANO, TIPO_AUDITORIA } from "@/lib/rotulos";
import { html, paragrafos } from "@/lib/pdf/html";
import type { ResultadoItemChecklist, StatusAuditoria } from "@/generated/prisma/client";
import {
  dataOuTraco,
  exigirControle,
  kpis,
  meta,
  nomeArquivo,
  rotuloUnidade,
  selo,
  seloNivel,
  vazio,
  type ContextoRelatorio,
  type RelatorioMontado,
} from "./comum";

export type VersaoRelatorioAuditoria = "preliminar" | "final";

/** Status a partir dos quais o relatório final pode ser emitido. */
export const STATUS_RELATORIO_FINAL: readonly StatusAuditoria[] = ["RELATORIO_FINAL", "MONITORAMENTO", "ENCERRADA"];

const RESULTADOS: ResultadoItemChecklist[] = ["CONFORME", "PARCIAL", "NAO_CONFORME", "NAO_APLICAVEL"];

/** Versão efetiva: o final só sai quando a auditoria chegou ao relatório final; antes disso é sempre preliminar. */
export function versaoEfetiva(status: StatusAuditoria, pedida?: VersaoRelatorioAuditoria): VersaoRelatorioAuditoria {
  if (!STATUS_RELATORIO_FINAL.includes(status)) return "preliminar";
  return pedida ?? "final";
}

export async function montarRelatorioAuditoria(
  ctx: ContextoRelatorio,
  params: { auditoriaId: string; versao?: VersaoRelatorioAuditoria },
): Promise<RelatorioMontado | null> {
  exigirControle(ctx);
  if (!z.uuid().safeParse(params.auditoriaId).success) return null;
  const unidade = { select: { nome: true, sigla: true } } as const;
  const bruto = await comCliente(ctx, (tx) =>
    tx.auditoria.findUnique({
      where: { id: params.auditoriaId },
      select: {
        id: true,
        numero: true,
        ano: true,
        titulo: true,
        tipo: true,
        objetivo: true,
        escopo: true,
        criterios: true,
        equipeIds: true,
        inicioPrevisto: true,
        fimPrevisto: true,
        status: true,
        unidade,
        itemPlano: { select: { plano: { select: { ano: true } } } },
        questoes: { orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }] },
        checklists: { orderBy: { criadoEm: "asc" }, select: { nome: true, itens: { select: { resultado: true } } } },
        achados: {
          orderBy: { numero: "asc" },
          select: {
            numero: true,
            titulo: true,
            condicao: true,
            criterio: true,
            causa: true,
            efeito: true,
            probabilidade: true,
            impacto: true,
            itemChecklist: { select: { texto: true, checklist: { select: { nome: true } } } },
            recomendacoes: {
              orderBy: { numero: "asc" },
              select: { numero: true, texto: true, prazo: true, unidade, acao: { select: { status: true, percentual: true } } },
            },
          },
        },
        plano: { select: { titulo: true, status: true, acoes: { select: { status: true, percentual: true, prazo: true } } } },
      },
    }),
  );
  if (!bruto) return null;
  const nomes = new Map(
    (await db.usuario.findMany({ where: { id: { in: bruto.equipeIds } }, select: { id: true, nome: true } })).map((u) => [u.id, u.nome]),
  );
  const hoje = dataIso(hojeComoDataSimples());
  const a = {
    ...bruto,
    equipe: bruto.equipeIds.map((id) => ({ nome: nomes.get(id) ?? "Usuário removido" })),
    achados: bruto.achados.map((x) => ({ ...x, nivel: classificarRisco(x.probabilidade, x.impacto) })),
  };
  const plano = bruto.plano
    ? {
        titulo: bruto.plano.titulo,
        status: bruto.plano.status,
        totalAcoes: bruto.plano.acoes.length,
        concluidas: bruto.plano.acoes.filter((x) => x.status === "CONCLUIDA").length,
        vencidas: bruto.plano.acoes.filter((x) => acaoVencida(x, hoje)).length,
        executado: percentualExecutado(bruto.plano.acoes),
      }
    : null;
  const versao = versaoEfetiva(a.status, params.versao);
  const numero = numeroAuditoria(a.numero, a.ano);
  const recomendacoes = a.achados.flatMap((ach) => ach.recomendacoes.map((r) => ({ ...r, achado: ach.numero })));
  const itensChecklist = a.checklists.flatMap((c) => c.itens);

  const corpo = html`
<h1>Relatório ${versao === "preliminar" ? "Preliminar" : "Final"} de Auditoria nº ${numero}</h1>
<p class="subtitulo">${a.titulo}</p>

<h2>1. Identificação</h2>
${meta([
  { rotulo: "Tipo", valor: TIPO_AUDITORIA[a.tipo] },
  { rotulo: "Situação", valor: STATUS_AUDITORIA[a.status] },
  { rotulo: "Alcance", valor: rotuloUnidade(a.unidade, "Entidade inteira") },
  { rotulo: "Período previsto", valor: `${dataOuTraco(a.inicioPrevisto)} a ${dataOuTraco(a.fimPrevisto)}` },
  { rotulo: "Equipe", valor: a.equipe.map((m) => m.nome).join(", ") || "—" },
  { rotulo: "Origem", valor: a.itemPlano ? `PAAI ${a.itemPlano.plano.ano}` : "Auditoria não prevista no PAAI" },
])}
${kpis([
  { rotulo: "Achados", valor: a.achados.length },
  { rotulo: "Recomendações", valor: recomendacoes.length },
  { rotulo: "Itens de checklist avaliados", valor: `${itensChecklist.filter((i) => i.resultado).length} de ${itensChecklist.length}` },
  { rotulo: "Execução do plano de ação", valor: plano?.executado != null ? `${plano.executado}%` : "—" },
])}

<h2>2. Objetivo</h2>
${paragrafos(a.objetivo)}

<h2>3. Escopo</h2>
${paragrafos(a.escopo, "Escopo não informado.")}

<h2>4. Critérios</h2>
${paragrafos(a.criterios, "Critérios não informados.")}

<h2>5. Matriz de planejamento</h2>
${
  a.questoes.length
    ? html`<table><thead><tr><th style="width:4%">#</th><th>Questão de auditoria</th><th>Informações requeridas</th><th>Fontes de informação</th><th>Procedimentos</th></tr></thead>
<tbody>${a.questoes.map(
        (q, i) => html`<tr><td class="centro">${i + 1}</td><td>${q.questao}</td><td>${q.informacoes ?? "—"}</td><td>${q.fontes ?? "—"}</td><td>${q.procedimentos ?? "—"}</td></tr>`,
      )}</tbody></table>`
    : vazio("Matriz de planejamento não preenchida.")
}

${
  a.checklists.length
    ? html`<h3>Checklists aplicados</h3>
<table><thead><tr><th>Checklist</th>${RESULTADOS.map((r) => html`<th class="num">${RESULTADO_ITEM_CHECKLIST[r]}</th>`)}<th class="num">Não avaliados</th></tr></thead>
<tbody>${a.checklists.map(
        (c) => html`<tr><td>${c.nome}</td>${RESULTADOS.map((r) => html`<td class="num">${c.itens.filter((i) => i.resultado === r).length}</td>`)}
<td class="num">${c.itens.filter((i) => !i.resultado).length}</td></tr>`,
      )}</tbody></table>`
    : null
}

<h2>6. Achados</h2>
${
  a.achados.length
    ? a.achados.map(
        (ach) => html`<div class="bloco quebravel">
<h3>Achado ${ach.numero} — ${ach.titulo} ${seloNivel(ach.nivel)}</h3>
<div class="campo"><div class="rotulo">Condição (situação encontrada)</div>${paragrafos(ach.condicao)}</div>
<div class="campo"><div class="rotulo">Critério (o que deveria ser)</div>${paragrafos(ach.criterio)}</div>
<div class="campo"><div class="rotulo">Causa</div>${paragrafos(ach.causa)}</div>
<div class="campo"><div class="rotulo">Efeito</div>${paragrafos(ach.efeito)}</div>
<p class="nota">Gravidade: probabilidade ${ach.probabilidade} × impacto ${ach.impacto} = ${ach.probabilidade * ach.impacto}${
          ach.itemChecklist ? ` · Item de checklist: ${ach.itemChecklist.checklist.nome} — ${ach.itemChecklist.texto}` : ""
        }</p>
${
  ach.recomendacoes.length
    ? html`<div class="campo"><div class="rotulo">Recomendações</div><ol style="margin:0;padding-left:5mm">${ach.recomendacoes.map(
        (r) => html`<li>${r.texto}${r.unidade || r.prazo ? html` <span class="nota">(${[r.unidade ? rotuloUnidade(r.unidade) : null, r.prazo ? `prazo ${dataOuTraco(r.prazo)}` : null].filter(Boolean).join(" · ")})</span>` : null}</li>`,
      )}</ol></div>`
    : null
}
</div>`,
      )
    : vazio("Nenhum achado registrado.")
}

<h2>7. Quadro de recomendações</h2>
${
  recomendacoes.length
    ? html`<table><thead><tr><th style="width:9%">Nº</th><th>Recomendação</th><th style="width:20%">Unidade responsável</th><th style="width:11%">Prazo</th><th style="width:16%">Ação no plano</th></tr></thead>
<tbody>${recomendacoes.map(
        (r) => html`<tr><td>${r.achado}.${r.numero}</td><td>${r.texto}</td><td>${rotuloUnidade(r.unidade)}</td><td>${dataOuTraco(r.prazo)}</td>
<td>${r.acao ? html`${selo(STATUS_ACAO[r.acao.status])}<br><span class="nota">${r.acao.percentual}% executado</span>` : "—"}</td></tr>`,
      )}</tbody></table>
${plano ? html`<p class="nota">Plano de ação: ${plano.titulo} · ${STATUS_PLANO[plano.status]} · ${plano.concluidas} de ${plano.totalAcoes} ação(ões) concluída(s), ${plano.vencidas} vencida(s).</p>` : null}`
    : vazio("Nenhuma recomendação registrada.")
}
${
  versao === "preliminar"
    ? html`<div class="bloco" style="margin-top:6mm"><p><strong>Versão preliminar.</strong> Este relatório está sujeito à manifestação da unidade auditada e pode ser alterado na versão final.</p></div>`
    : null
}
`;

  return {
    tipo: "auditoria",
    titulo: `Relatório ${versao === "preliminar" ? "Preliminar" : "Final"} de Auditoria nº ${numero}`,
    arquivo: nomeArquivo("auditoria", numero.replace("/", "-"), versao),
    corpo,
    marcaDagua: versao === "preliminar" ? "PRELIMINAR" : null,
    referencia: { entidade: "Auditoria", id: a.id },
    filtros: { auditoriaId: a.id, versao },
  };
}
