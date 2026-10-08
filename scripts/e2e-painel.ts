import "dotenv/config";
import { Client } from "pg";
import { chromium, type Page } from "playwright";

// E2E do painel personalizável, dos Alertas, do menu sem barra de rolagem e do texto padrão do relatório anual.
// Requer `npm run dev` e os dados de demonstração de Catolândia (`npm run demo:popular`).
// As credenciais padrão existem só no banco local de demonstração (as mesmas de scripts/manual/capturas.ts).
// Restaura ao final o tema da entidade e as preferências do usuário.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.MANUAL_SLUG ?? "catolandia-ba";
const EMAIL = process.env.MANUAL_EMAIL_CONTROLADOR ?? "usuario.catolandia@teste.invalid";
const SENHA = process.env.MANUAL_SENHA_CONTROLADOR ?? "Catolandia@2026";
const TEMAS = ["institucional", "petroleo", "grafite", "ameixa", "mata", "bordo"];
const ALTURAS = [768, 650];

const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

function conferir(descricao: string, ok: boolean, detalhe?: unknown) {
  console.log(`${ok ? "OK   " : "FALHA"} ${descricao}${!ok && detalhe !== undefined ? ` — ${JSON.stringify(detalhe)}` : ""}`);
  if (!ok) falhas++;
}

async function blocos(page: Page) {
  return page.locator("[data-bloco]").evaluateAll((els) =>
    els.map((e) => `${(e as HTMLElement).dataset.bloco}:${(e as HTMLElement).dataset.recolhido ? "R" : "A"}`),
  );
}

/** Elementos do menu (aside/header/nav) com barra de rolagem visível ou conteúdo cortado. */
async function barrasNoMenu(page: Page) {
  return page.evaluate(() => {
    const achados: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>("aside, aside *, header, header *, nav, nav *")) {
      const cs = getComputedStyle(el);
      const rolaY = /(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      const rolaX = /(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const barraVisivel = cs.scrollbarWidth !== "none" && (el.offsetWidth - el.clientWidth > 0 || el.offsetHeight - el.clientHeight > 0);
      if ((rolaY || rolaX) && barraVisivel) achados.push(`${el.tagName.toLowerCase()}.${el.className.toString().slice(0, 40)}`);
    }
    return achados;
  });
}

async function main() {
  await dono.connect();
  const { rows: cli } = await dono.query("SELECT c.id, c.tema FROM clientes c JOIN municipios m ON m.id = c.municipio_id WHERE m.slug = $1 AND c.tipo = 'PREFEITURA'", [SLUG]);
  const { rows: us } = await dono.query("SELECT id, preferencias FROM usuarios WHERE email = $1", [EMAIL]);
  if (!cli[0] || !us[0]) throw new Error("Dados de demonstração não encontrados (npm run demo:popular).");
  const [cliente, usuario] = [cli[0], us[0]];
  await dono.query("UPDATE usuarios SET preferencias = '{}' WHERE id = $1", [usuario.id]);

  const browser = await chromium.launch({ channel: "msedge", headless: true }).catch(() => chromium.launch({ headless: true }));
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, locale: "pt-BR" });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));

  try {
    await page.goto(`${BASE}/m/${SLUG}`, { timeout: 180_000 });
    await page.getByLabel("E-mail").fill(EMAIL);
    await page.getByLabel("Senha").fill(SENHA);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/m/"), { timeout: 120_000 });
    if (page.url().includes("/selecionar-cliente")) {
      await page.getByRole("button", { name: /Prefeitura Municipal de Catolândia/ }).click();
      await page.waitForURL(/\/painel/);
    }

    // ── Painel ──
    await page.goto(`${BASE}/painel`);
    await page.getByRole("heading", { name: "Painel", exact: true }).waitFor();
    const inicial = await blocos(page);
    conferir("painel exibe todos os 9 blocos por padrão, expandidos", inicial.length === 9 && inicial.every((b) => b.endsWith(":A")), inicial);
    conferir("índices em destaque no topo do painel", inicial[0] === "indices:A");
    conferir("índices incluem pessoal e dívida consolidada", (await page.getByText("Despesa com pessoal (Executivo)").isVisible()) && (await page.getByText("Dívida consolidada líquida / RCL").first().isVisible()));

    await page.getByRole("button", { name: /Índices em destaque/ }).click();
    await page.waitForTimeout(1200);
    await page.reload();
    await page.getByRole("heading", { name: "Painel", exact: true }).waitFor();
    conferir("bloco recolhido continua recolhido ao reabrir o painel", (await blocos(page))[0] === "indices:R");

    await page.getByRole("button", { name: "Recolher tudo" }).click();
    await page.waitForTimeout(1200);
    await page.reload();
    conferir("“Recolher tudo” é lembrado", (await blocos(page)).every((b) => b.endsWith(":R")));
    await page.getByRole("button", { name: "Expandir tudo" }).click();
    await page.waitForTimeout(1200);

    await page.getByRole("button", { name: "Personalizar painel" }).click();
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("checkbox", { name: /Unidades/ }).uncheck();
    await dialogo.getByRole("checkbox", { name: /Movimentações recentes/ }).uncheck();
    await dialogo.getByRole("button", { name: "Salvar" }).click();
    await dialogo.waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {});
    conferir("diálogo fecha ao salvar", !(await dialogo.isVisible()));
    await page.reload();
    const personalizado = await blocos(page);
    conferir("painel mostra só os blocos escolhidos", personalizado.length === 7 && !personalizado.some((b) => b.startsWith("unidades")), personalizado);
    conferir("blocos fora do painel têm atalho para a página", await page.getByText(/Fora do painel:/).isVisible());

    // ── Alertas ──
    await page.goto(`${BASE}/medidas`);
    conferir("/medidas redireciona para /alertas", new URL(page.url()).pathname === "/alertas");
    await page.getByRole("heading", { name: "Alertas", exact: true }).waitFor();
    conferir("página Alertas com alertas fiscais (LRF)", await page.getByRole("button", { name: /Alertas fiscais \(LRF\)/ }).isVisible());
    conferir("menu mostra “Alertas” e não “Medidas”", (await page.getByRole("link", { name: "Alertas", exact: true }).count()) > 0 && (await page.getByRole("link", { name: "Medidas", exact: true }).count()) === 0);

    // ── Dados externos ──
    await page.goto(`${BASE}/dados-externos`);
    conferir("dados externos exibem o bloco de endividamento", await page.getByRole("button", { name: /Endividamento e resultado primário/ }).isVisible());

    // ── Relatório anual ──
    await page.goto(`${BASE}/relatorios/anual/padrao`);
    conferir("texto padrão vem preenchido com o texto-base", (await page.getByLabel("Apresentação").inputValue()).includes("Relatório Anual de Controle Interno"));
    const ano = new Date().getFullYear();
    await page.goto(`${BASE}/relatorios/anual/${ano}`);
    conferir("exercício mostra quais seções seguem o padrão", (await page.getByText("Segue o texto padrão").count()) + (await page.getByText(`Personalizado para ${ano}`).count()) === 6);

    // ── Menu sem barra de rolagem em todos os temas ──
    for (const tema of TEMAS) {
      await dono.query("UPDATE clientes SET tema = $2 WHERE id = $1", [cliente.id, tema]);
      for (const altura of ALTURAS) {
        await page.setViewportSize({ width: 1366, height: altura });
        await page.goto(`${BASE}/painel`);
        await page.getByRole("heading", { name: "Painel", exact: true }).waitFor();
        const achados = await barrasNoMenu(page);
        conferir(`tema ${tema} (1366×${altura}): menu sem barra de rolagem`, achados.length === 0, achados);
      }
    }
    conferir("sem erros de JavaScript nas páginas", erros.length === 0, erros);
  } finally {
    await dono.query("UPDATE clientes SET tema = $2 WHERE id = $1", [cliente.id, cliente.tema]);
    await dono.query("UPDATE usuarios SET preferencias = $2 WHERE id = $1", [usuario.id, JSON.stringify(usuario.preferencias ?? {})]);
    await dono.end();
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  if (falhas) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
