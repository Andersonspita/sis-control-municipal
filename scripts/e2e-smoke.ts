import fs from "node:fs";
import path from "node:path";
import { chromium, type Page } from "playwright";

// Percorre os fluxos principais no Edge instalado. Requer `npm run dev` e o seed de demonstração.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SAIDA = path.resolve("docs/capturas");
const SENHA = "Demo@2026";
let falhas = 0;

function conferir(descricao: string, ok: boolean) {
  console.log(`${ok ? "OK   " : "FALHA"} ${descricao}`);
  if (!ok) falhas++;
}

async function entrar(page: Page, email: string) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
}

async function sair(page: Page) {
  await page.getByRole("button", { name: /Menu do usuário/ }).click();
  await page.getByRole("menuitem", { name: "Sair" }).click();
  await page.waitForURL(/\/login/, { timeout: 30_000 });
}

async function main() {
  fs.mkdirSync(SAIDA, { recursive: true });
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(e.message));

  try {
    await page.goto(`${BASE}/painel`);
    conferir("rota protegida sem sessão redireciona para /login", page.url().includes("/login"));
    await page.screenshot({ path: path.join(SAIDA, "01-login.png") });

    await page.getByLabel("E-mail").fill("controlador@exemplo.ba.gov.br");
    await page.getByLabel("Senha").fill("senha-errada");
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByText("E-mail ou senha inválidos.").waitFor({ timeout: 30_000 });
    conferir("senha errada mostra mensagem de erro", true);

    await entrar(page, "controlador@exemplo.ba.gov.br");
    conferir("controlador com 2 entidades vai para seleção de cliente", page.url().includes("/selecionar-cliente"));
    await page.screenshot({ path: path.join(SAIDA, "02-selecionar-cliente.png") });

    await page.getByRole("button", { name: /Prefeitura Municipal de Exemplo/ }).click();
    await page.waitForURL(/\/painel/, { timeout: 30_000 });
    await page.getByRole("heading", { name: "Painel" }).waitFor();
    conferir("painel da Prefeitura carregou", await page.getByText("Demandas em aberto").isVisible());
    await page.screenshot({ path: path.join(SAIDA, "03-painel.png"), fullPage: true });

    await page.getByRole("link", { name: "Normas" }).first().click();
    await page.waitForURL(/\/normas$/);
    await page.getByRole("link", { name: /Resolução TCM-BA/ }).click();
    await page.waitForURL(/\/normas\/.+/);
    conferir("detalhe da Res. 1120 lista o Art. 12", await page.getByText("Art. 12, I, a", { exact: true }).isVisible());
    await page.screenshot({ path: path.join(SAIDA, "04-norma-res1120.png") });

    await page.goto(`${BASE}/unidades`);
    const nome = `Controladoria Setorial ${Date.now().toString().slice(-5)}`;
    await page.getByLabel("Nome").fill(nome);
    await page.getByLabel("Sigla").fill("CST");
    await page.getByRole("button", { name: "Cadastrar unidade" }).click();
    await page.getByRole("cell", { name: new RegExp(nome) }).waitFor({ timeout: 30_000 });
    conferir("cadastro de unidade aparece na lista", true);
    await page.screenshot({ path: path.join(SAIDA, "05-unidades.png"), fullPage: true });

    await page.goto(`${BASE}/trilha`);
    conferir("trilha registra o cadastro da unidade", await page.getByText("Cadastrou unidade").first().isVisible());

    await page.getByRole("button", { name: /Trocar entidade/ }).click();
    await page.getByRole("menuitem", { name: /Câmara Municipal de Exemplo/ }).click();
    await page.waitForFunction(() => document.body.innerText.includes("Câmara Municipal de Exemplo"), null, { timeout: 30_000 });
    await page.goto(`${BASE}/unidades`);
    conferir("na Câmara não aparece a unidade criada na Prefeitura", !(await page.getByText(nome).isVisible()));
    await sair(page);

    await entrar(page, "saude@exemplo.ba.gov.br");
    conferir("satélite cai direto em /satelite", page.url().includes("/satelite"));
    const texto = await page.locator("main").innerText();
    conferir("satélite vê a demanda da regulação", texto.includes("Lista de espera da regulação"));
    conferir("satélite não vê a demanda do Gabinete", !texto.includes("contratos vigentes"));
    await page.screenshot({ path: path.join(SAIDA, "06-satelite.png") });

    await page.goto(`${BASE}/painel`);
    conferir("satélite não acessa o painel do controlador", page.url().includes("/satelite"));
    await page.goto(`${BASE}/trilha`);
    conferir("satélite não acessa a trilha", page.url().includes("/satelite"));
    await sair(page);

    await page.goto(`${BASE}/propostas-visuais`);
    await page.screenshot({ path: path.join(SAIDA, "07-propostas-visuais.png"), fullPage: true });

    conferir(`sem erros de JavaScript na página (${erros.length})`, erros.length === 0);
    if (erros.length) console.log(erros.join("\n"));
  } finally {
    await browser.close();
  }
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
