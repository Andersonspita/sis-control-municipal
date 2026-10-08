import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { iniciarNavegador } from "../manual/capturas";

// Gera docs/tecnico/Documentacao-Tecnica.pdf a partir de docs/tecnico/documentacao-tecnica.html.
// Uso: npm run docs:tecnico   (não precisa do servidor rodando)
const PASTA = path.resolve("docs/tecnico");
const HTML = path.join(PASTA, "documentacao-tecnica.html");
const SAIDA = path.join(PASTA, "Documentacao-Tecnica.pdf");

async function main() {
  const browser = await iniciarNavegador();
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(HTML).href, { waitUntil: "load" });
    await page.emulateMedia({ media: "print" });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(SAIDA, pdf);
    const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
    console.log(`PDF: ${SAIDA}`);
    console.log(`Páginas: ${paginas} · Tamanho: ${(pdf.length / 1024).toFixed(0)} KB`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
