import { bruto, escapar, html, type Html } from "./html";

// Layout de impressão comum a todos os relatórios: A4, cabeçalho com brasão e nome da entidade,
// rodapé com emissão e paginação. Fontes do sistema (no Docker: fonts-liberation / fonts-dejavu).

const FONTE = `"Segoe UI", "Liberation Sans", "DejaVu Sans", Arial, Helvetica, sans-serif`;
const FONTE_SERIFADA = `Cambria, "Liberation Serif", "DejaVu Serif", Georgia, "Times New Roman", serif`;

const CSS = `
@page { size: A4; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; font-family: ${FONTE}; font-size: 10pt; line-height: 1.45; color: #1c2430; }
h1 { font-size: 16pt; margin: 0 0 2mm; color: #12304a; line-height: 1.2; }
h2 { font-size: 12.5pt; margin: 7mm 0 2.5mm; padding-bottom: 1mm; border-bottom: 0.6pt solid #9fb3c8; color: #12304a; break-after: avoid; }
h3 { font-size: 10.5pt; margin: 5mm 0 2mm; color: #12304a; break-after: avoid; }
p { margin: 0 0 2mm; text-align: justify; }
p.vazio, .vazio { color: #6b7785; font-style: italic; }
.subtitulo { color: #4a5868; margin: 0 0 5mm; }
.meta { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1mm 6mm; margin: 0 0 4mm; font-size: 9.5pt; }
.meta div { display: flex; gap: 2mm; }
.meta dt, .meta .rotulo { color: #4a5868; min-width: 30mm; }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 3mm; margin: 3mm 0 4mm; }
.kpi { border: 0.6pt solid #c9d4df; border-radius: 2mm; padding: 2.5mm 3mm; background: #f5f8fb; break-inside: avoid; }
.kpi .valor { font-size: 15pt; font-weight: 700; color: #12304a; line-height: 1.1; }
.kpi .rotulo { font-size: 8.5pt; color: #4a5868; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 8.8pt; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
th { background: #e6edf4; color: #12304a; text-align: left; font-weight: 600; }
th, td { border: 0.5pt solid #c3cfdb; padding: 1.4mm 2mm; vertical-align: top; }
tbody tr:nth-child(even) td { background: #f8fafc; }
td.num, th.num { text-align: right; white-space: nowrap; }
td.centro, th.centro { text-align: center; }
.selo { display: inline-block; padding: 0.3mm 1.8mm; border-radius: 1.5mm; font-size: 8pt; font-weight: 600; border: 0.5pt solid currentColor; white-space: nowrap; }
.selo.critico { color: #9b1c1c; background: #fde8e8; }
.selo.alto { color: #9a4a00; background: #fff1e0; }
.selo.medio { color: #7a6400; background: #fff8d6; }
.selo.baixo { color: #1f6b3a; background: #e5f5ea; }
.selo.neutro { color: #34495e; background: #eef2f6; }
.barra { height: 2.2mm; background: #e3e9ef; border-radius: 1mm; overflow: hidden; min-width: 22mm; }
.barra > span { display: block; height: 100%; background: #2f6f9f; }
.bloco { border: 0.6pt solid #c9d4df; border-radius: 2mm; padding: 3mm 4mm; margin: 0 0 4mm; break-inside: avoid; }
.bloco.quebravel { break-inside: auto; }
.bloco h3 { margin-top: 0; }
.campo { margin: 0 0 2mm; }
.campo > .rotulo { font-weight: 600; color: #12304a; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.02em; }
.quebra { break-before: page; }
.nota { font-size: 8.5pt; color: #4a5868; }
.matriz { border-collapse: separate; border-spacing: 1mm; width: auto; margin: 2mm 0 4mm; }
.matriz td, .matriz th { border: none; padding: 0; background: none !important; }
.matriz td.celula { width: 17mm; height: 11mm; text-align: center; vertical-align: middle; font-size: 11pt; font-weight: 700; border-radius: 1.2mm; }
.matriz td.celula.critico { background: #f3b4b4 !important; color: #7a1010; }
.matriz td.celula.alto { background: #fbd3a6 !important; color: #7a3a00; }
.matriz td.celula.medio { background: #fbeaa0 !important; color: #5f4e00; }
.matriz td.celula.baixo { background: #bfe5cb !important; color: #18522d; }
.matriz .eixo { font-size: 8pt; color: #4a5868; padding: 0 2mm; text-align: right; white-space: nowrap; }
.matriz .eixo-x { font-size: 8pt; color: #4a5868; text-align: center; }
.marca-dagua { position: fixed; top: 42%; left: 0; right: 0; text-align: center; font-size: 82pt; font-weight: 800;
  letter-spacing: 0.08em; color: rgba(155, 28, 28, 0.11); transform: rotate(-35deg); z-index: 0; pointer-events: none; }
main { position: relative; z-index: 1; }
.oficio { font-family: ${FONTE_SERIFADA}; font-size: 11.5pt; line-height: 1.6; }
.oficio p { text-indent: 12mm; }
.oficio .sem-recuo, .oficio .sem-recuo p { text-indent: 0; }
.assinatura { margin-top: 22mm; text-align: center; break-inside: avoid; }
.assinatura .linha { width: 85mm; margin: 0 auto 1.5mm; border-top: 0.6pt solid #1c2430; }
.direita { text-align: right; }
`;

export function documentoHtml(opcoes: { titulo: string; conteudo: Html; marcaDagua?: string | null }): string {
  return html`<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${opcoes.titulo}</title>
<style>${bruto(CSS)}</style>
</head>
<body>
${opcoes.marcaDagua ? html`<div class="marca-dagua">${opcoes.marcaDagua}</div>` : null}
<main>${opcoes.conteudo}</main>
</body>
</html>`.valor;
}

// Cabeçalho e rodapé do Chromium: HTML isolado da página, sem CSS externo; o tamanho de fonte padrão é zero.

export function cabecalhoPdf(opcoes: { entidade: string; local: string; brasao: string | null; titulo: string }) {
  const brasao = opcoes.brasao
    ? `<img src="${escapar(opcoes.brasao)}" style="height:15mm;width:auto;max-width:18mm;object-fit:contain;margin-right:3mm">`
    : "";
  return `<div style="width:100%;margin:0 16mm;padding-bottom:2mm;border-bottom:0.6pt solid #9fb3c8;display:flex;align-items:center;font-family:${escapar(FONTE)};-webkit-print-color-adjust:exact">
  ${brasao}
  <div style="flex:1">
    <div style="font-size:11pt;font-weight:700;color:#12304a">${escapar(opcoes.entidade)}</div>
    <div style="font-size:8pt;color:#4a5868">${escapar(opcoes.local)} · Controladoria / Controle Interno</div>
  </div>
  <div style="font-size:8pt;color:#4a5868;text-align:right;max-width:70mm">${escapar(opcoes.titulo)}</div>
</div>`;
}

export function rodapePdf(opcoes: { emitidoEm: string; emissor: string }) {
  return `<div style="width:100%;margin:0 16mm;padding-top:1.5mm;border-top:0.5pt solid #c3cfdb;display:flex;justify-content:space-between;font-family:${escapar(FONTE)};font-size:7.5pt;color:#4a5868">
  <span>Emitido em ${escapar(opcoes.emitidoEm)} por ${escapar(opcoes.emissor)}</span>
  <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
</div>`;
}
