import "server-only";
import { z } from "zod";
import { db, type ContextoCliente } from "@/lib/db";
import { ErroNegocio } from "@/lib/erros";
import { formatarDataHora, formatarDataSimples, hojeComoDataSimples } from "@/lib/datas";
import { STATUS_ACAO, TIPO_CLIENTE } from "@/lib/rotulos";
import { acaoVencida, dataIso, formatarMoeda } from "@/lib/dados/acoes";
import type { StatusAcao } from "@/generated/prisma/client";
import { NIVEL_RISCO, type NivelRisco } from "@/lib/risco";
import { brasaoComoDataUri } from "@/lib/pdf/brasao";
import { html, type Html } from "@/lib/pdf/html";
import { cabecalhoPdf, documentoHtml, rodapePdf } from "@/lib/pdf/layout";
import { gerarPdf } from "@/lib/pdf/navegador";

export type ContextoRelatorio = ContextoCliente & { usuarioNome: string };

export type TipoRelatorio = "autoavaliacao" | "demandas" | "alertas" | "auditoria" | "anual" | "oficio";

export type RelatorioMontado = {
  tipo: TipoRelatorio;
  titulo: string;
  /** Nome do arquivo sem extensão. */
  arquivo: string;
  corpo: Html;
  marcaDagua?: string | null;
  paisagem?: boolean;
  referencia?: { entidade: string; id: string };
  filtros?: Record<string, string | number | null>;
};

export class ErroAcessoRelatorio extends ErroNegocio {
  constructor() {
    super("Relatórios disponíveis apenas para a controladoria.");
  }
}

/** Defesa em profundidade: além da RLS, o satélite não monta relatórios (veria as demandas da própria unidade). */
export function exigirControle(ctx: ContextoCliente) {
  if (ctx.perfil === "SATELITE") throw new ErroAcessoRelatorio();
}

export const uuidOpcional = z
  .string()
  .trim()
  .transform((v) => v || undefined)
  .pipe(z.uuid().optional())
  .optional()
  .catch(undefined);

export const dataOpcional = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .transform((v) => new Date(`${v}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()))
  .optional()
  .catch(undefined);

export function nomeArquivo(...partes: (string | number | null | undefined)[]) {
  return partes
    .filter((p) => p !== null && p !== undefined && p !== "")
    .join("-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase();
}

/** Dados da entidade para o cabeçalho (tabela global `clientes`). */
export async function dadosEntidade(clienteId: string) {
  const c = await db.cliente.findUniqueOrThrow({
    where: { id: clienteId },
    select: { nome: true, tipo: true, cnpj: true, municipio: true, uf: true, brasaoKey: true },
  });
  return { ...c, tipoRotulo: TIPO_CLIENTE[c.tipo], brasao: await brasaoComoDataUri(c.brasaoKey) };
}

/** Nome e cargo de quem emite (vínculo com o cliente), para o bloco de assinatura. */
export async function assinante(ctx: ContextoRelatorio) {
  const v = await db.vinculoCliente.findUnique({
    where: { usuarioId_clienteId: { usuarioId: ctx.usuarioId, clienteId: ctx.clienteId } },
    select: { cargo: true, perfil: true },
  });
  const cargo = v?.cargo?.trim() || (v?.perfil === "CONTROLADOR" ? "Controlador(a) Interno(a)" : "Equipe de Controle Interno");
  return { nome: ctx.usuarioNome, cargo };
}

export function blocoAssinatura(a: { nome: string; cargo: string }, local?: string) {
  return html`<div class="assinatura">
${local ? html`<p class="direita" style="margin-bottom:16mm">${local}</p>` : null}
<div class="linha"></div>
<div><strong>${a.nome}</strong></div>
<div class="nota">${a.cargo}</div>
</div>`;
}

/** "Salvador/BA, 5 de outubro de 2026" (data de hoje no fuso de Brasília). */
export function localEData(municipio: string, uf: string, data = new Date()) {
  const extenso = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia", day: "numeric", month: "long", year: "numeric" }).format(data);
  return `${municipio}/${uf}, ${extenso}.`;
}

export async function montarDocumento(ctx: ContextoRelatorio, rel: RelatorioMontado, emitidoEm = new Date()) {
  const entidade = await dadosEntidade(ctx.clienteId);
  return {
    html: documentoHtml({ titulo: rel.titulo, conteudo: rel.corpo, marcaDagua: rel.marcaDagua }),
    cabecalho: cabecalhoPdf({
      entidade: entidade.nome,
      local: `${entidade.municipio}/${entidade.uf}`,
      brasao: entidade.brasao,
      titulo: rel.titulo,
    }),
    rodape: rodapePdf({ emitidoEm: formatarDataHora(emitidoEm), emissor: ctx.usuarioNome }),
  };
}

export async function gerarPdfRelatorio(ctx: ContextoRelatorio, rel: RelatorioMontado) {
  const doc = await montarDocumento(ctx, rel);
  return gerarPdf(doc.html, { cabecalho: doc.cabecalho, rodape: doc.rodape, paisagem: rel.paisagem });
}

// ───────── Peças de layout reutilizadas pelos relatórios ─────────

export function kpis(itens: { rotulo: string; valor: string | number }[]) {
  return html`<div class="kpis">${itens.map(
    (i) => html`<div class="kpi"><div class="valor">${i.valor}</div><div class="rotulo">${i.rotulo}</div></div>`,
  )}</div>`;
}

export function meta(itens: { rotulo: string; valor: string | number | null | undefined }[]) {
  return html`<dl class="meta">${itens.map(
    (i) => html`<div><dt>${i.rotulo}:</dt><dd style="margin:0">${i.valor ?? "—"}</dd></div>`,
  )}</dl>`;
}

export function seloNivel(nivel: NivelRisco) {
  return html`<span class="selo ${nivel.toLowerCase()}">${NIVEL_RISCO[nivel]}</span>`;
}

export function selo(texto: string) {
  return html`<span class="selo neutro">${texto}</span>`;
}

export function barra(percentual: number | null) {
  const p = Math.max(0, Math.min(100, percentual ?? 0));
  return html`<div class="barra"><span style="width:${p}%"></span></div>`;
}

export function vazio(texto: string) {
  return html`<p class="vazio">${texto}</p>`;
}

export function inteiro(n: number) {
  return n.toLocaleString("pt-BR");
}

export function rotuloUnidade(u: { nome: string; sigla: string | null } | null | undefined, padrao = "—") {
  if (!u) return padrao;
  return u.sigla ? `${u.sigla} — ${u.nome}` : u.nome;
}

export function dataOuTraco(d: Date | null | undefined) {
  return d ? formatarDataSimples(d) : "—";
}

export const SELECAO_ACAO_5W2H = {
  id: true,
  oQue: true,
  porQue: true,
  onde: true,
  prazo: true,
  responsavel: true,
  como: true,
  custoEstimado: true,
  status: true,
  percentual: true,
  unidadeResponsavel: { select: { nome: true, sigla: true } },
} as const;

type Acao5w2h = {
  oQue: string;
  porQue: string | null;
  onde: string | null;
  prazo: Date | null;
  responsavel: string | null;
  como: string | null;
  custoEstimado: { toString(): string } | null;
  status: StatusAcao;
  percentual: number;
  unidadeResponsavel: { nome: string; sigla: string | null } | null;
};

/** Tabela 5W2H com situação (vencida calculada no fuso de Brasília). */
export function tabelaAcoes(acoes: readonly Acao5w2h[]) {
  if (!acoes.length) return vazio("Nenhuma ação cadastrada.");
  const hoje = dataIso(hojeComoDataSimples());
  return html`<table>
<thead><tr><th style="width:4%">#</th><th>O quê / Por quê</th><th>Onde / Como</th><th>Quem</th><th style="width:11%">Quando</th><th style="width:10%">Quanto</th><th style="width:13%">Situação</th></tr></thead>
<tbody>${acoes.map((a, i) => {
    const vencida = acaoVencida(a, hoje);
    return html`<tr>
<td class="centro">${i + 1}</td>
<td><strong>${a.oQue}</strong>${a.porQue ? html`<br><span class="nota">${a.porQue}</span>` : null}</td>
<td>${a.onde ?? "—"}${a.como ? html`<br><span class="nota">${a.como}</span>` : null}</td>
<td>${a.responsavel ?? "—"}${a.unidadeResponsavel ? html`<br><span class="nota">${rotuloUnidade(a.unidadeResponsavel)}</span>` : null}</td>
<td>${dataOuTraco(a.prazo)}${vencida ? html`<br><span class="selo critico">Vencida</span>` : null}</td>
<td class="num">${a.custoEstimado ? formatarMoeda(a.custoEstimado.toString()) : "—"}</td>
<td>${STATUS_ACAO[a.status]}${a.status !== "CONCLUIDA" && a.status !== "CANCELADA" ? html`<br><span class="nota">${a.percentual}% executado</span>` : null}</td>
</tr>`;
  })}</tbody></table>`;
}

/** "dd/mm/aaaa" a "dd/mm/aaaa", ou texto para período aberto. */
export function descreverPeriodo(inicio?: Date, fim?: Date) {
  const f = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
  if (inicio && fim) return `${f(inicio)} a ${f(fim)}`;
  if (inicio) return `a partir de ${f(inicio)}`;
  if (fim) return `até ${f(fim)}`;
  return "Todo o período";
}
