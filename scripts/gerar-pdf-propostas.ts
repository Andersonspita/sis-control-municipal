import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { OUTROS_TOKENS_AMEIXA, TOKENS_AMEIXA } from "../src/app/propostas-visuais/ameixa/tokens";

// Gera docs/propostas-visuais.pdf e as imagens em docs/design/. Requer `npm run dev` rodando.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DOCS = path.join(process.cwd(), "docs");
const IMAGENS = path.join(DOCS, "design");

const PROPOSTAS = [
  {
    tema: "institucional",
    nome: "Institucional",
    numero: 1,
    resumo:
      "Azul-marinho com detalhes em dourado e tipografia Public Sans, criada para serviços públicos. Transmite formalidade e confiança, próxima da linguagem visual de tribunais e órgãos de controle.",
    fontes: "Public Sans (textos e títulos)",
    cantos: "Médios (8 px)",
    navegacao: "Menu lateral fixo",
    indicada: "Quem quer um visual oficial, reconhecível como sistema de governo.",
  },
  {
    tema: "petroleo",
    nome: "Verde-petróleo",
    numero: 2,
    resumo:
      "Visual claro e arejado, menu lateral branco, cantos mais arredondados e tipografia IBM Plex Sans. Mais leve para uso prolongado e com aparência de produto moderno.",
    fontes: "IBM Plex Sans (textos e títulos)",
    cantos: "Arredondados (12 px)",
    navegacao: "Menu lateral fixo",
    indicada: "Equipes que passam o dia no sistema e preferem uma interface leve.",
  },
  {
    tema: "grafite",
    nome: "Grafite e âmbar",
    numero: 3,
    resumo:
      "Grafite com destaque âmbar, títulos em serifa (Source Serif) e cantos retos. Sóbria e de alto contraste, lembra documentos oficiais e relatórios de auditoria.",
    fontes: "Source Sans 3 (textos) e Source Serif 4 (títulos)",
    cantos: "Retos (4 px)",
    navegacao: "Menu lateral fixo",
    indicada: "Quem valoriza seriedade e a estética de relatório técnico.",
  },
  {
    tema: "ameixa",
    nome: "Ameixa e ciano",
    numero: 4,
    resumo:
      "Ameixa profundo com detalhes em ciano e tipografia Atkinson Hyperlegible, criada pelo Braille Institute para máxima legibilidade. Navegação no topo em dois níveis, que libera toda a largura da tela para tabelas e textos normativos.",
    fontes: "Atkinson Hyperlegible Next (textos e títulos) e Mono (números e códigos)",
    cantos: "Médios (6 px)",
    navegacao: "Barra superior em dois níveis",
    indicada: "Quem quer legibilidade máxima e telas largas para tabelas e textos de norma.",
  },
] as const;

const TELAS_AMEIXA = [
  { id: "tela-login", titulo: "1 · Login", texto: "Área institucional com os três benefícios do sistema e formulário com erro genérico, foco visível e aviso de acesso registrado." },
  { id: "tela-painel", titulo: "2 · Painel do controlador", texto: "Cinco indicadores numa linha, aderência às normas com detalhamento por situação, tramitações recentes e prazos dos próximos 7 dias. Filtro por unidade no topo." },
  { id: "tela-norma", titulo: "3 · Norma e árvore de requisitos", texto: "Sumário fixo e área de leitura com linha de 68 caracteres. Itens que não se aplicam à Câmara ficam esmaecidos e com etiqueta tracejada." },
  { id: "tela-autoavaliacao", titulo: "4 · Autoavaliação de um requisito", texto: "Situação escolhida em quatro cartões grandes com ícone e texto. Sugestão da IA separada, em ciano, sempre pendente de revisão e com a página citada." },
  { id: "tela-plano", titulo: "5 · Plano de ação (5W2H)", texto: "Tabela densa com prioridade em barras (forma e texto) e painel lateral com os sete campos do 5W2H e os marcos de execução." },
  { id: "tela-demanda", titulo: "6 · Demanda e tramitação", texto: "Linha do tempo imutável com autor, data e anexos de cada evento. Decisões do controlador (aceitar ou devolver) à direita." },
  { id: "tela-satelite", titulo: "7 · Área do satélite — computador e celular", texto: "Sem menus: só os pedidos, o prazo em linguagem simples e o botão de responder. No celular, botões de 48 px e navegação inferior com dois itens." },
  { id: "componentes", titulo: "Componentes base", texto: "Botões, campos, seleção, etiquetas de situação (sempre com ícone e texto), prioridade, risco, cartão de indicador, tabela, linha do tempo e marca." },
] as const;

const TOKENS = [
  ["--primary", "Primária"],
  ["--sidebar", "Navegação"],
  ["--destaque", "Destaque"],
  ["--background", "Fundo"],
  ["--foreground", "Texto"],
  ["--sucesso", "Sucesso"],
  ["--alerta", "Alerta"],
  ["--perigo", "Perigo"],
] as const;

type Cor = { nome: string; hex: string };

const b64 = (arquivo: string) => fs.readFileSync(arquivo).toString("base64");

async function main() {
  fs.mkdirSync(IMAGENS, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });

  const telas = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: "pt-BR" });
  await telas.goto(`${BASE}/propostas-visuais/ameixa`, { waitUntil: "networkidle" });
  await telas.evaluate(() => document.fonts.ready);
  await telas.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
  const imagensTelas: string[] = [];
  for (const t of TELAS_AMEIXA) {
    const arquivo = path.join(IMAGENS, `proposta-4-${t.id}.png`);
    await telas.locator(`#${t.id} > :nth-child(2)`).screenshot({ path: arquivo });
    imagensTelas.push(b64(arquivo));
  }
  await telas.close();

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: "pt-BR" });
  await page.goto(`${BASE}/propostas-visuais`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const dados: { imagem: string; cores: Cor[] }[] = [];
  for (const p of PROPOSTAS) {
    const secao = page.locator(`section[data-tema="${p.tema}"]`);
    const arquivo = path.join(IMAGENS, `proposta-${p.numero}-${p.tema}.png`);
    await secao.locator(":scope > div").nth(1).screenshot({ path: arquivo });
    const cores = await secao.evaluate((el, tokens) => {
      const estilo = getComputedStyle(el);
      const ctx = document.createElement("canvas").getContext("2d")!;
      return tokens.map(([variavel, nome]) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = estilo.getPropertyValue(variavel).trim();
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return { nome, hex: "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase() };
      });
    }, TOKENS as unknown as [string, string][]);
    dados.push({ imagem: b64(arquivo), cores });
  }

  const paleta = (cores: Cor[]) =>
    cores
      .map((c) => `<div class="cor"><span style="background:${c.hex}"></span><div><b>${c.nome}</b><small>${c.hex}</small></div></div>`)
      .join("");

  const topo = (esquerda: string) =>
    `<header class="topo"><span>${esquerda}</span><span>Sistema de Controladoria Municipal</span></header>`;

  const paginasPropostas = PROPOSTAS.map(
    (p, i) => `
    <section class="pagina" data-tema="${p.tema}">
      ${topo(`Proposta ${p.numero} de ${PROPOSTAS.length}${p.tema === "ameixa" ? " · nova" : ""}`)}
      <div class="corpo">
        <div class="lado">
          <h2>${p.numero} · ${p.nome}</h2>
          <p>${p.resumo}</p>
          <dl>
            <dt>Tipografia</dt><dd>${p.fontes}</dd>
            <dt>Cantos</dt><dd>${p.cantos}</dd>
            <dt>Navegação</dt><dd>${p.navegacao}</dd>
            <dt>Indicada para</dt><dd>${p.indicada}</dd>
          </dl>
          <h3>Paleta</h3>
          <div class="paleta">${paleta(dados[i].cores)}</div>
          ${p.tema === "ameixa" ? `<p class="aviso">As 7 telas, os componentes e a tabela de tokens desta proposta estão nas próximas páginas.</p>` : ""}
        </div>
        <img src="data:image/png;base64,${dados[i].imagem}" alt="Tela de exemplo na proposta ${p.nome}" />
      </div>
    </section>`,
  ).join("");

  const paginasTelas = TELAS_AMEIXA.map(
    (t, i) => `
    <section class="pagina" data-tema="ameixa">
      ${topo(`Proposta 4 · Ameixa e ciano · ${i < 7 ? `tela ${i + 1} de 7` : "componentes"}`)}
      <div class="titulo-tela"><h2>${t.titulo}</h2><p>${t.texto}</p></div>
      <div class="tela"><img src="data:image/png;base64,${imagensTelas[i]}" alt="${t.titulo}" /></div>
    </section>`,
  ).join("");

  const linhasTokens = TOKENS_AMEIXA.map(
    (t) => `<tr><td class="cod">${t.token}</td><td><span class="amostra" style="background:${t.hex}"></span><span class="cod">${t.hex}</span></td><td>${t.uso}</td></tr>`,
  );
  const metade = 18;
  const tabelaTokens = (linhas: string[]) =>
    `<table class="tokens"><thead><tr><th>Token</th><th>Cor</th><th>Uso</th></tr></thead><tbody>${linhas.join("")}</tbody></table>`;
  const paginaTokens = `
    <section class="pagina" data-tema="ameixa">
      ${topo("Proposta 4 · Ameixa e ciano · tokens")}
      <div class="titulo-tela"><h2>Tabela de tokens</h2><p>Valores para aplicar no sistema (Tailwind CSS v4 + shadcn/ui). Todos os pares de texto atendem ao contraste mínimo de 4,5:1 (WCAG 2.1 AA); bordas de campo e contorno de foco, a 3:1.</p></div>
      <div class="grade-tokens">
        ${tabelaTokens(linhasTokens.slice(0, metade))}
        <div>
          ${tabelaTokens(linhasTokens.slice(metade))}
          <table class="tokens outros"><thead><tr><th>Token</th><th>Valor</th></tr></thead><tbody>
            ${OUTROS_TOKENS_AMEIXA.map((t) => `<tr><td><b>${t.token}</b><small>${t.uso}</small></td><td class="cod">${t.valor}</td></tr>`).join("")}
          </tbody></table>
        </div>
      </div>
    </section>`;

  const comparativo = PROPOSTAS.map(
    (p, i) => `
      <div class="cartao" data-tema="${p.tema}">
        <img src="data:image/png;base64,${dados[i].imagem}" alt="" />
        <h3>${p.numero} · ${p.nome}</h3>
        <p>${p.fontes}</p>
        <p>${p.navegacao} · cantos ${p.cantos.toLowerCase()}</p>
        <div class="faixa">${dados[i].cores.slice(0, 3).map((c) => `<span style="background:${c.hex}"></span>`).join("")}</div>
      </div>`,
  ).join("");

  const hoje = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "America/Bahia" }).format(new Date());

  await page.evaluate(
    ({ html, css }) => {
      document.querySelectorAll("nextjs-portal").forEach((n) => n.remove());
      const estilo = document.createElement("style");
      estilo.textContent = css;
      document.head.appendChild(estilo);
      const main = document.querySelector("main")!;
      main.removeAttribute("style");
      main.className = main.className
        .split(" ")
        .filter((c) => !/^(mx-|max-w|space-|px-|py-)/.test(c))
        .join(" ");
      main.innerHTML = html;
    },
    {
      css: CSS,
      html: `
      <section class="pagina capa" data-tema="institucional">
        <div>
          <p class="sobre">HorizonAJ</p>
          <h1>Sistema de Controladoria Municipal</h1>
          <p class="sub">Propostas de identidade visual</p>
          <p class="texto">Quatro direções visuais para o sistema. A mesma tela de painel aparece em cada proposta; a escolhida será aplicada a todas as telas. A proposta 4 traz também as sete telas principais, os componentes e a tabela de tokens. Todas usam modo claro e atendem ao contraste mínimo de acessibilidade (WCAG 2.1 AA / eMAG).</p>
        </div>
        <div class="miniaturas">${dados.map((d) => `<img src="data:image/png;base64,${d.imagem}" alt="" />`).join("")}</div>
        <p class="data">${hoje[0].toUpperCase() + hoje.slice(1)}</p>
      </section>
      ${paginasPropostas}
      ${paginasTelas}
      ${paginaTokens}
      <section class="pagina" data-tema="institucional">
        ${topo("Comparativo")}
        <h2>Lado a lado</h2>
        <div class="grade">${comparativo}</div>
        <p class="nota">Para escolher, basta indicar o número da proposta. Ajustes finos (tom de cor, fonte, arredondamento) podem ser feitos sobre a escolhida.</p>
      </section>`,
    },
  );
  await page.evaluate(() => document.fonts.ready);
  if (process.argv.includes("--previa")) {
    const paginasPdf = page.locator(".pagina");
    for (let i = 0; i < (await paginasPdf.count()); i++) {
      await paginasPdf.nth(i).screenshot({ path: path.join(IMAGENS, `previa-pagina-${i + 1}.png`) });
    }
  }
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: path.join(DOCS, "propostas-visuais.pdf"), format: "A4", landscape: true, printBackground: true });
  await browser.close();
  console.log("Gerado docs/propostas-visuais.pdf e imagens em docs/design/.");
}

const CSS = `
@page { size: A4 landscape; margin: 0; }
html, body { background: #fff !important; margin: 0; }
.pagina { box-sizing: border-box; width: 297mm; height: 210mm; padding: 12mm 14mm; overflow: hidden;
  break-after: page; display: flex; flex-direction: column; gap: 5mm; background: var(--background); color: var(--foreground); font-family: var(--fonte-texto); }
.pagina:last-child { break-after: auto; }
.pagina h1, .pagina h2, .pagina h3 { font-family: var(--fonte-titulo); margin: 0; }
.topo { display: flex; justify-content: space-between; font-size: 9pt; color: var(--muted-foreground);
  border-bottom: 1px solid var(--border); padding-bottom: 3mm; text-transform: uppercase; letter-spacing: .08em; }
.capa { background: var(--sidebar); color: var(--sidebar-foreground); justify-content: space-between; padding: 22mm 22mm; }
.capa .sobre { color: var(--sidebar-primary); font-weight: 600; letter-spacing: .2em; text-transform: uppercase; font-size: 10pt; margin: 0 0 7mm; }
.capa h1 { font-size: 32pt; line-height: 1.1; color: #fff; max-width: 220mm; }
.capa .sub { font-size: 17pt; color: var(--sidebar-primary); margin: 3mm 0 8mm; }
.capa .texto { max-width: 190mm; font-size: 11pt; line-height: 1.6; opacity: .9; margin: 0; }
.capa .data { font-size: 10pt; opacity: .75; margin: 0; }
.miniaturas { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
.miniaturas img { width: 100%; border-radius: 6px; box-shadow: 0 6px 24px rgba(0,0,0,.35); }
.corpo { flex: 1; display: grid; grid-template-columns: 82mm 1fr; gap: 9mm; min-height: 0; }
.lado h2 { font-size: 20pt; margin-bottom: 3mm; }
.lado p { font-size: 10pt; line-height: 1.55; color: var(--muted-foreground); margin: 0 0 4mm; }
.lado .aviso { color: var(--primary); font-weight: 600; margin-top: 5mm; }
.lado dl { font-size: 9.5pt; margin: 0 0 5mm; display: grid; grid-template-columns: auto 1fr; gap: 1.5mm 4mm; }
.lado dt { font-weight: 600; } .lado dd { margin: 0; color: var(--muted-foreground); }
.lado h3 { font-size: 11pt; margin-bottom: 2.5mm; }
.paleta { display: grid; grid-template-columns: 1fr 1fr; gap: 2.5mm; }
.cor { display: flex; align-items: center; gap: 2.5mm; font-size: 8.5pt; }
.cor span { width: 9mm; height: 9mm; border-radius: var(--radius); border: 1px solid rgba(0,0,0,.12); flex-shrink: 0; }
.cor b { display: block; font-weight: 600; } .cor small { color: var(--muted-foreground); font-family: var(--font-mono); }
.corpo img { width: 100%; height: auto; max-height: 100%; object-fit: contain; object-position: top; border-radius: var(--radius);
  box-shadow: 0 4px 18px rgba(0,0,0,.08); align-self: start; }
.titulo-tela h2 { font-size: 16pt; }
.titulo-tela p { font-size: 9.5pt; line-height: 1.5; color: var(--muted-foreground); margin: 1.5mm 0 0; max-width: 230mm; }
.tela { flex: 1; min-height: 0; display: flex; justify-content: center; align-items: flex-start; }
.tela img { max-width: 100%; max-height: 100%; object-fit: contain; }
.grade-tokens { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; align-items: start; }
.tokens { width: 100%; border-collapse: collapse; font-size: 7.6pt; background: var(--card); border: 1px solid var(--border); }
.tokens th { text-align: left; background: var(--muted); color: var(--muted-foreground); font-size: 7pt; text-transform: uppercase; padding: 1.4mm 2mm; }
.tokens td { padding: .75mm 2mm; border-top: 1px solid var(--border); vertical-align: middle; }
.tokens .cod { font-family: var(--fonte-codigo); }
.tokens .amostra { display: inline-block; width: 4mm; height: 4mm; border-radius: 2px; border: 1px solid rgba(0,0,0,.15); vertical-align: middle; margin-right: 2mm; }
.tokens.outros { margin-top: 3mm; } .tokens small { display: inline; margin-left: 2mm; color: var(--muted-foreground); }
.pagina > h2 { font-size: 20pt; }
.grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5mm; }
.cartao { background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 3.5mm; font-family: var(--fonte-texto); color: var(--foreground); }
.cartao img { width: 100%; border-radius: calc(var(--radius) * .6); border: 1px solid var(--border); }
.cartao h3 { font-size: 11pt; margin: 3mm 0 1mm; }
.cartao p { font-size: 8pt; line-height: 1.4; color: var(--muted-foreground); margin: 0 0 1mm; }
.faixa { display: flex; height: 4mm; border-radius: 999px; overflow: hidden; border: 1px solid var(--border); margin-top: 2.5mm; } .faixa span { flex: 1; }
.nota { font-size: 10pt; line-height: 1.55; color: var(--muted-foreground); max-width: 220mm; margin: 0; }
`;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
