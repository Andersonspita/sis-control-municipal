import { chromium, type Browser, type Page } from "playwright";

// Fluxo completo de demandas, tramitação, documentos e área do satélite no Edge instalado.
// Requer `npm run dev` e o seed de demonstração. Cria dados de teste (assunto "Teste E2E ...").
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SENHA = "Demo@2026";
let falhas = 0;

function conferir(descricao: string, ok: boolean) {
  console.log(`${ok ? "OK   " : "FALHA"} ${descricao}`);
  if (!ok) falhas++;
}

async function sessao(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR", acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log(`  [erro JS ${email}] ${e.message}`));
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(selecionar-cliente|painel|satelite)/, { timeout: 30_000 });
  if (page.url().includes("/selecionar-cliente")) {
    await page.getByRole("button", { name: /Prefeitura Municipal de Exemplo/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/selecionar-cliente"), { timeout: 30_000 });
  }
  return page;
}

function pdfMinimo(texto: string) {
  return Buffer.from(`%PDF-1.4\n% ${texto}\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`);
}

async function toast(page: Page, texto: string | RegExp) {
  try {
    await page.getByText(texto).first().waitFor({ timeout: 30_000 });
  } catch (err) {
    const avisos = await page.locator("[data-sonner-toast]").allInnerTexts();
    console.log(`  avisos na tela: ${JSON.stringify(avisos)}`);
    await page.screenshot({ path: "e2e-falha.png", fullPage: true });
    throw err;
  }
}

async function captura(page: Page, nome: string) {
  if (process.env.CAPTURAS) await page.screenshot({ path: `${process.env.CAPTURAS}/${nome}.png`, fullPage: true });
}

async function aparece(locator: ReturnType<Page["getByText"]>) {
  try {
    await locator.first().waitFor({ timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const assunto = `Teste E2E ${Date.now().toString().slice(-6)}`;
  try {
    const ctl = await sessao(browser, "controlador@exemplo.ba.gov.br");

    await ctl.goto(`${BASE}/demandas`);
    conferir("lista de demandas carrega com dados do seed", await ctl.getByRole("link", { name: /Escala de plantões/ }).isVisible());
    await captura(ctl, "demandas-lista");
    await ctl.goto(`${BASE}/demandas?vencidas=1`);
    conferir("filtro de vencidas mostra a demanda vencida do seed", await ctl.getByRole("link", { name: /ambulâncias/ }).isVisible());
    conferir("filtro de vencidas oculta demandas no prazo", !(await ctl.getByRole("link", { name: /Escala de plantões/ }).isVisible()));

    await ctl.goto(`${BASE}/demandas/nova`);
    await ctl.getByLabel(/Assunto/).fill(assunto);
    await ctl.getByLabel(/O que está sendo solicitado/).fill("Enviar os documentos de teste automatizado com a resposta da unidade.");
    await ctl.getByLabel(/Unidade destinatária/).selectOption({ label: "SESAU — Secretaria Municipal de Saúde (João Secretário de Saúde)" });
    await ctl.getByLabel("Prioridade").selectOption("ALTA");
    await ctl.locator('input[type="file"]').setInputFiles({ name: "oficio-teste.pdf", mimeType: "application/pdf", buffer: pdfMinimo("oficio") });
    conferir("arquivo selecionado aparece na lista antes do envio", await ctl.getByText("oficio-teste.pdf").isVisible());
    await ctl.getByRole("button", { name: "Enviar demanda" }).click();
    await ctl.waitForURL(/\/demandas\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const urlDemanda = ctl.url();
    const numero = (await ctl.locator("dd.font-mono").first().innerText()).trim();
    conferir(`demanda criada com numeração sequencial (${numero})`, /^\d{3}\/\d{4}$/.test(numero));
    conferir("situação inicial Enviada com ícone e texto", await ctl.getByText("Enviada", { exact: true }).first().isVisible());

    const link = ctl.getByRole("link", { name: /^Baixar oficio-teste\.pdf \(/ });
    const href = await link.getAttribute("href");
    const resp = await ctl.request.get(`${BASE}${href}`);
    conferir(
      "download autenticado devolve o arquivo como anexo",
      resp.status() === 200 && (resp.headers()["content-disposition"] ?? "").startsWith("attachment") && (await resp.body()).subarray(0, 5).toString() === "%PDF-",
    );

    await ctl.getByRole("textbox", { name: "Comentário" }).fill("Comentário interno do teste: não deve aparecer para a unidade.");
    await ctl.getByRole("button", { name: "Registrar comentário" }).click();
    await toast(ctl, "Comentário registrado.");
    conferir("comentário interno aparece na tramitação do controlador", await aparece(ctl.getByText("Interno: não visível à unidade")));

    await ctl.goto(`${BASE}/documentos?origem=demanda&busca=oficio-teste`);
    conferir("repositório lista o anexo da demanda com filtro por origem e nome", await ctl.getByRole("link", { name: "oficio-teste.pdf" }).first().isVisible());
    await ctl.goto(`${BASE}/documentos`);
    await ctl.locator('input[type="file"]').setInputFiles({ name: "norma-interna-teste.txt", mimeType: "text/plain", buffer: Buffer.from("texto de teste") });
    await ctl.getByRole("button", { name: "Enviar", exact: true }).click();
    await toast(ctl, "Documento enviado.");
    conferir("upload avulso aparece no repositório", await aparece(ctl.getByRole("link", { name: "norma-interna-teste.txt" })));
    await captura(ctl, "documentos");
    const hrefAvulso = await ctl.getByRole("link", { name: "norma-interna-teste.txt" }).first().getAttribute("href");

    await ctl.locator('input[type="file"]').setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("não é pdf") });
    await ctl.getByRole("button", { name: "Enviar", exact: true }).click();
    await toast(ctl, /conteúdo não corresponde/);
    conferir("arquivo com conteúdo incompatível com a extensão é recusado", true);

    // Satélite
    const sat = await sessao(browser, "saude@exemplo.ba.gov.br");
    conferir("satélite vê a nova demanda na caixa", await sat.getByRole("link", { name: assunto }).isVisible());
    await sat.getByRole("link", { name: assunto }).click();
    await sat.waitForURL(/\/satelite\/demandas\//);
    await sat.getByText("Demanda visualizada pela unidade").waitFor({ timeout: 30_000 });
    conferir("primeira abertura marca a demanda como Visualizada", true);
    conferir("satélite não vê o comentário interno", !(await sat.getByText("Comentário interno do teste").isVisible()));
    conferir("satélite baixa o anexo enviado pela controladoria", (await sat.request.get(`${BASE}${href}`)).status() === 200);
    conferir("satélite não baixa documento avulso da controladoria", (await sat.request.get(`${BASE}${hrefAvulso}`)).status() === 404);

    await sat.getByRole("button", { name: "Pedir prorrogação" }).click();
    const novaData = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await sat.getByLabel(/Nova data/).fill(novaData);
    await sat.getByLabel(/Justificativa/).fill("Precisamos de mais prazo para reunir os documentos do teste.");
    await sat.getByRole("button", { name: "Enviar pedido" }).click();
    await toast(sat, "Pedido de prorrogação enviado à controladoria.");
    conferir("pedido de prorrogação registrado", await aparece(sat.getByText(/aguardando decisão/)));

    await sat.getByLabel(/Sua resposta/).fill("Resposta do teste automatizado, com planilha anexa.");
    await sat.locator('input[type="file"]').setInputFiles({ name: "planilha-resposta.csv", mimeType: "text/csv", buffer: Buffer.from("a;b\n1;2\n") });
    await sat.getByRole("button", { name: "Enviar resposta" }).click();
    await toast(sat, "Resposta enviada à controladoria.");
    await sat.getByText("Resposta enviada.", { exact: true }).waitFor({ timeout: 30_000 });
    conferir("resposta enviada muda a situação para Respondida", await aparece(sat.getByText("Respondida", { exact: true })));

    await captura(sat, "satelite-demanda");
    await sat.goto(`${BASE}/satelite/painel`);
    conferir("painel da unidade mostra os contadores", await sat.getByText("A vencer em 7 dias").isVisible());
    await captura(sat, "satelite-painel");
    conferir("painel da unidade lista a demanda nos prazos", await sat.getByRole("link", { name: assunto }).isVisible());
    await sat.goto(`${BASE}/documentos`);
    conferir("satélite não acessa o repositório de documentos", sat.url().includes("/satelite"));
    await sat.goto(`${BASE}/demandas`);
    conferir("satélite não acessa a lista de demandas da controladoria", sat.url().includes("/satelite"));

    // Controlador analisa e decide
    await ctl.goto(urlDemanda);
    conferir("controlador vê o pedido de prorrogação pendente", await ctl.getByRole("heading", { name: "Pedido de prorrogação" }).isVisible());
    await ctl.getByRole("button", { name: "Deferir prorrogação" }).click();
    await ctl.getByRole("dialog").getByRole("button", { name: "Deferir prorrogação" }).click();
    await toast(ctl, "Prorrogação deferida e prazo atualizado.");
    const [a, m, d] = novaData.split("-");
    conferir("prazo atualizado após deferimento", await aparece(ctl.getByText(`${d}/${m}/${a}`)));

    await ctl.getByRole("button", { name: "Iniciar análise da resposta" }).click();
    await toast(ctl, "Resposta em análise.");
    await ctl.getByRole("button", { name: "Devolver para complementação" }).click();
    await ctl.getByLabel(/O que precisa ser complementado/).fill("Faltou a assinatura do responsável.");
    await ctl.getByRole("dialog").getByRole("button", { name: "Devolver para complementação" }).click();
    await toast(ctl, "Demanda devolvida para complementação.");

    await sat.goto(urlDemanda.replace("/demandas/", "/satelite/demandas/"));
    conferir("satélite vê o pedido de complementação", await sat.getByText("Faltou a assinatura do responsável.").first().isVisible());
    await sat.getByLabel(/Sua resposta/).fill("Segue a versão assinada.");
    await sat.getByRole("button", { name: "Enviar resposta" }).click();
    await toast(sat, "Resposta enviada à controladoria.");

    await ctl.reload();
    await ctl.getByRole("button", { name: "Aceitar e concluir" }).click();
    await ctl.getByLabel("Parecer").fill("Resposta completa.");
    await ctl.getByRole("dialog").getByRole("button", { name: "Aceitar e concluir" }).click();
    await toast(ctl, "Resposta aceita e demanda concluída.");
    conferir("demanda concluída", await aparece(ctl.getByText("Concluída", { exact: true })));
    await captura(ctl, "demanda-detalhe");

    // Demanda nascida de um requisito da autoavaliação: a resposta aceita vira evidência do requisito.
    await ctl.goto(`${BASE}/autoavaliacao`);
    await ctl.getByRole("link", { name: `Autoavaliação ${new Date().getFullYear()}`, exact: true }).click();
    await ctl.waitForURL(/\/autoavaliacao\/[0-9a-f-]{36}/);
    const urlCiclo = ctl.url().split("#")[0];
    const solicitar = ctl.getByRole("link", { name: "Solicitar documento a uma unidade" });
    conferir("cartão do requisito oferece solicitar documento a uma unidade", await aparece(solicitar));
    await solicitar.first().click();
    await ctl.waitForURL(/\/demandas\/nova\?requisito=/);
    conferir("nova demanda mostra o requisito de origem", await aparece(ctl.getByText("Origem:")));
    conferir("assunto pré-preenchido a partir do requisito", (await ctl.getByLabel(/Assunto/).inputValue()).startsWith("Evidência: "));
    await ctl.getByLabel(/Unidade destinatária/).selectOption({ label: "SESAU — Secretaria Municipal de Saúde (João Secretário de Saúde)" });
    await ctl.getByRole("button", { name: "Enviar demanda" }).click();
    await ctl.waitForURL(/\/demandas\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    const urlReq = ctl.url();
    conferir("detalhe da demanda mostra o requisito de origem com link", await ctl.getByRole("link", { name: /^Requisito / }).isVisible());

    await ctl.goto(`${BASE}/demandas/nova?requisito=00000000-0000-4000-8000-000000000000`);
    conferir("origem inexistente é ignorada com aviso", await aparece(ctl.getByText("A origem indicada foi ignorada")));

    await sat.goto(urlReq.replace("/demandas/", "/satelite/demandas/"));
    await sat.getByText("Demanda visualizada pela unidade").waitFor({ timeout: 30_000 });
    conferir("satélite vê a ligação com a autoavaliação", await aparece(sat.getByText(/ligada à autoavaliação/)));
    conferir("satélite não recebe link para a autoavaliação", (await sat.getByRole("link", { name: /^Requisito / }).count()) === 0);
    const nomeEvidencia = `evidencia-${Date.now().toString().slice(-6)}.pdf`;
    await sat.getByLabel(/Sua resposta/).fill("Segue o documento comprobatório do requisito.");
    await sat.locator('input[type="file"]').setInputFiles({ name: nomeEvidencia, mimeType: "application/pdf", buffer: pdfMinimo("evidencia") });
    await sat.getByRole("button", { name: "Enviar resposta" }).click();
    await toast(sat, "Resposta enviada à controladoria.");

    await ctl.goto(urlReq);
    await ctl.getByRole("button", { name: "Aceitar e concluir" }).click();
    await ctl.getByRole("dialog").getByRole("button", { name: "Aceitar e concluir" }).click();
    await toast(ctl, "1 documento virou evidência do requisito.");
    conferir("conclusão informa o documento que virou evidência", true);
    await ctl.goto(urlCiclo);
    conferir("documento da resposta aparece nas evidências do requisito", await aparece(ctl.getByText(nomeEvidencia)));

    await ctl.goto(`${BASE}/trilha`);
    const trilha = await ctl.locator("main").innerText();
    conferir("trilha registra download de documento", trilha.includes("documento.baixado") || trilha.includes("Baixou documento"));
    conferir("trilha registra a conclusão da demanda", trilha.includes("demanda.concluida") || trilha.includes("Concluiu demanda"));
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
