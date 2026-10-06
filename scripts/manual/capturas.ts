import fs from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "playwright-core";

// Captura as telas do Manual do Controlador em docs/manual/img/ (1366×768).
// Requer `npm run dev` e os dados de demonstração de Catolândia (`npm run demo:popular`).
// As credenciais padrão existem só no banco local de demonstração; troque-as por variáveis de ambiente.
// Uso: npx tsx scripts/manual/capturas.ts [--faltantes]   (--faltantes: só gera as imagens que ainda não existem)
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.MANUAL_SLUG ?? "catolandia-ba";
const ENTIDADE = /Prefeitura Municipal de Catolândia/;
const CONTROLADOR = {
  email: process.env.MANUAL_EMAIL_CONTROLADOR ?? "usuario.catolandia@teste.invalid",
  senha: process.env.MANUAL_SENHA_CONTROLADOR ?? "Catolandia@2026",
};
const SATELITE = {
  email: process.env.MANUAL_EMAIL_SATELITE ?? "renata.lobo@demo.catolandia.ba.gov.br.invalid",
  senha: process.env.MANUAL_SENHA_SATELITE ?? "Catolandia@2026",
};
const SAIDA = path.resolve("docs/manual/img");
const VIEWPORT = { width: 1366, height: 768 };
const SO_FALTANTES = process.argv.includes("--faltantes");

const OCULTAR = `nextjs-portal, [data-nextjs-toast], [data-sonner-toaster] { display: none !important; }
*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }`;

let falhas = 0;

export async function iniciarNavegador(): Promise<Browser> {
  const executablePath = process.env.PDF_CHROMIUM_PATH || undefined;
  try {
    return await chromium.launch({ headless: true, executablePath });
  } catch (err) {
    if (executablePath) throw err;
    for (const channel of ["msedge", "chrome"]) {
      try {
        return await chromium.launch({ headless: true, channel });
      } catch {
        // próximo canal
      }
    }
    throw err;
  }
}

function existe(nome: string) {
  return SO_FALTANTES && fs.existsSync(path.join(SAIDA, `${nome}.png`));
}

async function estabilizar(page: Page) {
  await page.waitForLoadState("load");
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
  await page.addStyleTag({ content: OCULTAR });
  await page.waitForTimeout(600);
}

async function capturar(page: Page, nome: string, opcoes: { inteira?: boolean; alturaMax?: number } = {}) {
  if (existe(nome)) return;
  await estabilizar(page);
  const arquivo = path.join(SAIDA, `${nome}.png`);
  if (opcoes.inteira) {
    const altura = await page.evaluate(() => document.documentElement.scrollHeight);
    const h = Math.min(altura, opcoes.alturaMax ?? 1400);
    await page.screenshot({ path: arquivo, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORT.width, height: h } });
  } else {
    await page.screenshot({ path: arquivo });
  }
  console.log(`ok  ${nome}`);
}

async function ir(page: Page, rota: string) {
  await page.goto(rota.startsWith("http") ? rota : `${BASE}${rota}`, { waitUntil: "load", timeout: 180_000 });
}

async function etapa(nome: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    falhas++;
    console.error(`FALHA ${nome}: ${(err as Error).message.split("\n")[0]}`);
  }
}

/** Links de detalhe da lista atual (ex.: /demandas/<id>), sem "nova" e subpáginas conhecidas. */
async function detalhes(page: Page, prefixo: string, ignorar: string[] = []) {
  await estabilizar(page);
  const hrefs = await page.locator(`main a[href^="${prefixo}/"]`).evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
  return [...new Set(hrefs)].filter((h) => {
    const resto = h.slice(prefixo.length + 1).split(/[?#]/)[0];
    return resto && !resto.includes("/") && !["nova", ...ignorar].includes(resto);
  });
}

/** Entre os detalhes, o que tem mais itens de lista (histórico mais rico). */
async function maisCompleto(page: Page, lista: string[], limite = 6) {
  let melhor: string | undefined;
  let maior = -1;
  for (const href of lista.slice(0, limite)) {
    await ir(page, href);
    await estabilizar(page);
    const n = await page.locator("main li, main tr").count();
    if (n > maior) [melhor, maior] = [href, n];
  }
  return melhor;
}

async function abrirAba(page: Page, nome: RegExp) {
  const aba = page.getByRole("tab", { name: nome });
  if (!(await aba.count())) return false;
  await aba.first().click();
  await page.waitForTimeout(800);
  return true;
}

async function entrar(page: Page, cred: { email: string; senha: string }) {
  await ir(page, `/m/${SLUG}`);
  await page.getByLabel("E-mail").fill(cred.email);
  await page.getByLabel("Senha").fill(cred.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/m/") && !u.pathname.startsWith("/login"), { timeout: 120_000 });
  if (page.url().includes("/selecionar-cliente")) {
    await page.getByRole("button", { name: ENTIDADE }).first().click();
    await page.waitForURL((u) => !u.pathname.startsWith("/selecionar-cliente"), { timeout: 120_000 });
  }
}

async function telaSimples(page: Page, rota: string, nome: string, opcoes?: { inteira?: boolean; alturaMax?: number }) {
  await etapa(nome, async () => {
    if (existe(nome)) return;
    await ir(page, rota);
    await capturar(page, nome, opcoes);
  });
}

async function controlador(browser: Browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "pt-BR", timezoneId: "America/Bahia", colorScheme: "light" });
  const page = await ctx.newPage();

  await telaSimples(page, `/m/${SLUG}`, "01-acesso-municipio");
  await entrar(page, CONTROLADOR);

  await telaSimples(page, "/painel", "02-painel");
  await etapa("03-menu-usuario", async () => {
    if (existe("03-menu-usuario")) return;
    await ir(page, "/painel");
    await estabilizar(page);
    await page.getByRole("button", { name: /Menu do usuário/ }).click();
    await page.waitForTimeout(500);
    await capturar(page, "03-menu-usuario");
    await page.keyboard.press("Escape");
  });

  await telaSimples(page, "/unidades", "04-unidades");
  await telaSimples(page, "/demandas", "05-demandas");
  await telaSimples(page, "/demandas/nova", "06-demanda-nova");
  await etapa("07-demanda-detalhe", async () => {
    if (existe("07-demanda-detalhe")) return;
    await ir(page, "/demandas");
    const alvo = await maisCompleto(page, await detalhes(page, "/demandas"), 8);
    if (!alvo) throw new Error("nenhuma demanda na lista");
    await ir(page, alvo);
    await capturar(page, "07-demanda-detalhe");
  });

  await etapa("09-norma-detalhe", async () => {
    if (existe("09-norma-detalhe")) return;
    await ir(page, "/normas");
    const [norma] = await detalhes(page, "/normas");
    if (!norma) throw new Error("nenhuma norma");
    await ir(page, norma);
    await capturar(page, "09-norma-detalhe");
  });

  await telaSimples(page, "/autoavaliacao", "10-autoavaliacao");
  await etapa("11-ciclo", async () => {
    if (existe("11-ciclo") && existe("12-ciclo-requisitos")) return;
    await ir(page, "/autoavaliacao");
    const [ciclo] = await detalhes(page, "/autoavaliacao");
    if (!ciclo) throw new Error("nenhum ciclo");
    await ir(page, ciclo);
    await capturar(page, "11-ciclo");
    if (await abrirAba(page, /Requisitos/)) await capturar(page, "12-ciclo-requisitos", { inteira: true, alturaMax: 1500 });
  });

  await telaSimples(page, "/planos", "13-planos");
  await etapa("14-plano-detalhe", async () => {
    if (existe("14-plano-detalhe")) return;
    await ir(page, "/planos");
    const [plano] = await detalhes(page, "/planos");
    if (!plano) throw new Error("nenhum plano");
    await ir(page, plano);
    await capturar(page, "14-plano-detalhe", { inteira: true, alturaMax: 1300 });
  });

  await telaSimples(page, "/auditorias", "15-auditorias");
  await telaSimples(page, "/auditorias/paai", "16-paai");
  await etapa("17-auditoria-detalhe", async () => {
    if (existe("17-auditoria-detalhe") && existe("18-auditoria-achados")) return;
    await ir(page, "/auditorias");
    const alvo = await maisCompleto(page, await detalhes(page, "/auditorias", ["paai", "modelos"]), 5);
    if (!alvo) throw new Error("nenhuma auditoria");
    await ir(page, alvo);
    await capturar(page, "17-auditoria-detalhe");
    if (await abrirAba(page, /Achados/)) await capturar(page, "18-auditoria-achados");
  });
  await telaSimples(page, "/auditorias/modelos", "19-modelos-checklist");

  await telaSimples(page, "/medidas", "20-medidas");
  await etapa("21-medida-detalhe", async () => {
    if (existe("21-medida-detalhe")) return;
    await ir(page, "/medidas");
    const alvo = await maisCompleto(page, await detalhes(page, "/medidas"), 5);
    if (!alvo) throw new Error("nenhuma medida");
    await ir(page, alvo);
    await capturar(page, "21-medida-detalhe");
  });
  await telaSimples(page, "/medidas/nova", "22-medida-nova");

  await telaSimples(page, "/documentos", "23-documentos");
  await telaSimples(page, "/ia", "24-ia");
  await telaSimples(page, "/relatorios", "25-relatorios");
  await telaSimples(page, "/dados-externos", "26-dados-externos");
  await telaSimples(page, "/trilha", "27-trilha");
  await telaSimples(page, "/configuracoes", "28-configuracoes");

  await ctx.close();
}

async function satelite(browser: Browser) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, locale: "pt-BR", timezoneId: "America/Bahia", colorScheme: "light" });
  const page = await ctx.newPage();
  await entrar(page, SATELITE);
  await telaSimples(page, "/satelite", "30-satelite-demandas");
  await etapa("31-satelite-demanda", async () => {
    if (existe("31-satelite-demanda")) return;
    await ir(page, "/satelite");
    await estabilizar(page);
    const href = await page.locator('main a[href^="/satelite/demandas/"]').first().getAttribute("href");
    if (!href) throw new Error("nenhuma demanda do satélite");
    await ir(page, href);
    await capturar(page, "31-satelite-demanda");
  });
  await telaSimples(page, "/satelite/painel", "32-satelite-painel");
  await ctx.close();
}

export async function capturarTelas() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const browser = await iniciarNavegador();
  try {
    await etapa("controlador", () => controlador(browser));
    await etapa("satelite", () => satelite(browser));
  } finally {
    await browser.close();
  }
  return falhas;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  capturarTelas().then(
    (n) => process.exit(n ? 1 : 0),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
