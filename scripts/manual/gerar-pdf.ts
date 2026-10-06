import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
import { capturarTelas, iniciarNavegador } from "./capturas";

// Gera docs/manual/Manual-do-Controlador.pdf a partir de docs/manual/manual-controlador.html.
// Uso: npm run manual:pdf [-- --capturar]
//   --capturar  refaz as capturas de tela antes (requer `npm run dev` e os dados de demonstração).
// Sem imagens em docs/manual/img/, as capturas são feitas automaticamente.
const PASTA = path.resolve("docs/manual");
const HTML = path.join(PASTA, "manual-controlador.html");
const IMAGENS = path.join(PASTA, "img");
const SAIDA = path.join(PASTA, "Manual-do-Controlador.pdf");
const LIMITE_MB = 15;

async function textoPorPagina(pdf: Buffer) {
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  const { text } = await extractText(doc, { mergePages: false });
  // Sem espaços: o espaçamento entre letras dos títulos fragmenta as palavras na extração.
  return text.map((t) => t.normalize("NFC").replace(/\s+/g, ""));
}

async function main() {
  const temImagens = fs.existsSync(IMAGENS) && fs.readdirSync(IMAGENS).some((f) => f.endsWith(".png"));
  if (process.argv.includes("--capturar") || !temImagens) {
    console.log("Capturando telas…");
    const falhas = await capturarTelas();
    if (falhas) console.warn(`Atenção: ${falhas} captura(s) falharam; o manual usará as imagens existentes.`);
  }

  const browser = await iniciarNavegador();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(HTML).href, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });

    const quebradas = await page.evaluate(() =>
      [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src")),
    );
    if (quebradas.length) throw new Error(`Imagens não carregadas: ${quebradas.join(", ")}`);
    const imagens = await page.evaluate(() => document.images.length);

    // Cabeçalho, rodapé e numeração vêm das caixas de margem do @page no HTML (a capa fica sem eles).
    const renderizar = () => page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });

    // 1ª passagem: descobre a página de início de cada capítulo para preencher o sumário.
    const paginas = await textoPorPagina(await renderizar());
    const capitulos = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>(".pg[data-cap]")].map((el) => el.dataset.cap ?? ""),
    );
    const mapa: Record<string, number> = {};
    for (const cap of capitulos) {
      const i = paginas.findIndex((t, idx) => idx > 1 && t.includes(`Capítulo${cap}`));
      if (i < 0) {
        const amostra = paginas.slice(2, 4).map((t) => t.slice(0, 120)).join(" | ");
        throw new Error(`Capítulo ${cap} não encontrado no PDF. Início das páginas 3–4: ${amostra}`);
      }
      mapa[cap] = i + 1;
    }
    await page.evaluate((m) => {
      document.querySelectorAll<HTMLElement>(".pg[data-cap]").forEach((el) => {
        el.textContent = String(m[el.dataset.cap ?? ""] ?? "");
      });
    }, mapa);

    const pdf = await renderizar();
    fs.writeFileSync(SAIDA, pdf);

    const textos = await textoPorPagina(pdf);
    const total = textos.length;
    const quaseVazias = textos.map((t, i) => [i + 1, t.length] as const).filter(([n, len]) => n > 1 && len < 500);
    if (quaseVazias.length) console.warn(`Páginas com pouco texto (confira se não sobrou só um trecho): ${quaseVazias.map(([n]) => n).join(", ")}`);
    const mb = pdf.length / 1024 / 1024;
    console.log(`PDF: ${SAIDA}`);
    console.log(`Páginas: ${total} · Imagens: ${imagens} · Tamanho: ${mb.toFixed(1)} MB`);
    console.log(`Sumário: ${Object.entries(mapa).map(([c, p]) => `${Number(c)}→p.${p}`).join(" ")}`);
    if (mb > LIMITE_MB) console.warn(`Atenção: o PDF passou de ${LIMITE_MB} MB; considere comprimir as imagens.`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
