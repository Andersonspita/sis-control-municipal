import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";
import { chromium, type Browser, type Page } from "playwright";
import { hojeComoDataSimples, somarDias } from "../src/lib/datas";

// Notificações por e-mail das demandas, conferidas na API do Mailpit (a caixa é esvaziada no início).
// Requer `npm run dev`, o seed de demonstração e o Mailpit do docker compose (SMTP localhost:1025).
// Cria dados de teste (assunto "Teste e-mail ..."); as demandas de lembrete são canceladas no fim.
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SENHA = "Demo@2026";
const CONTROLADOR = "controlador@exemplo.ba.gov.br";
const SATELITE = "saude@exemplo.ba.gov.br";
let falhas = 0;

function conferir(descricao: string, ok: boolean) {
  console.log(`${ok ? "OK   " : "FALHA"} ${descricao}`);
  if (!ok) falhas++;
}

type Email = { ID: string; Subject: string; To: { Address: string }[] };

async function caixa(): Promise<Email[]> {
  const r = await fetch(`${MAILPIT}/api/v1/messages?limit=500`);
  if (!r.ok) throw new Error(`Mailpit indisponível (${r.status}).`);
  return (await r.json()).messages ?? [];
}

async function textoDoEmail(id: string): Promise<string> {
  return (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()).Text ?? "";
}

const para = (e: Email, email: string) => e.To.some((t) => t.Address.toLowerCase() === email);

/** Aguarda (o envio roda depois da resposta) até haver `quantidade` e-mails com o assunto. */
async function esperarEmails(assunto: string, quantidade: number) {
  const limite = Date.now() + 60_000;
  let achados: Email[] = [];
  while (Date.now() < limite) {
    achados = (await caixa()).filter((e) => e.Subject.startsWith(assunto));
    if (achados.length >= quantidade) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 1_000));
  return (await caixa()).filter((e) => e.Subject.startsWith(assunto));
}

let esperados = 0;

/** Confere que cada destinatário recebeu `vezes` e-mails com o assunto, e ninguém mais. */
async function conferirEvento(descricao: string, destinatarios: string[], assunto: string, vezes = 1) {
  const achados = await esperarEmails(assunto, destinatarios.length * vezes);
  esperados += destinatarios.length;
  const ok = achados.length === destinatarios.length * vezes && destinatarios.every((d) => achados.filter((e) => para(e, d)).length === vezes);
  conferir(`${descricao} (${destinatarios.length} destinatário(s))`, ok);
  return achados;
}

const PM = "00000000000191";

/** Destinatários esperados, lidos direto do banco (cálculo independente do código da aplicação). */
async function destinatariosEsperados() {
  const pg = new Client({ connectionString: process.env.DATABASE_URL });
  await pg.connect();
  try {
    const controle = await pg.query(
      `SELECT lower(u.email) AS email FROM vinculos_cliente v
         JOIN usuarios u ON u.id = v.usuario_id JOIN clientes c ON c.id = v.cliente_id
        WHERE c.cnpj = $1 AND v.ativo AND u.ativo AND v.perfil IN ('CONTROLADOR', 'EQUIPE')`,
      [PM],
    );
    const satelites = async (sigla: string) =>
      (
        await pg.query(
          `WITH RECURSIVE acima AS (
             SELECT u.id, u.pai_id FROM unidades u JOIN clientes c ON c.id = u.cliente_id WHERE c.cnpj = $1 AND u.sigla = $2
             UNION SELECT u.id, u.pai_id FROM unidades u JOIN acima a ON u.id = a.pai_id)
           SELECT DISTINCT lower(us.email) AS email FROM escopos_satelite e
             JOIN acima a ON a.id = e.unidade_id JOIN vinculos_cliente v ON v.id = e.vinculo_id JOIN usuarios us ON us.id = v.usuario_id
            WHERE v.ativo AND us.ativo AND v.perfil = 'SATELITE'`,
          [PM, sigla],
        )
      ).rows.map((r) => r.email as string);
    return { controle: controle.rows.map((r) => r.email as string), sesau: await satelites("SESAU"), reg: await satelites("REG") };
  } finally {
    await pg.end();
  }
}

async function sessao(browser: Browser, email: string) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "pt-BR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  page.on("pageerror", (e) => console.log(`  [erro JS ${email}] ${e.message}`));
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(SENHA);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(selecionar-cliente|painel|satelite)/, { timeout: 120_000 });
  if (page.url().includes("/selecionar-cliente")) {
    await page.getByRole("button", { name: /Prefeitura Municipal de Exemplo/ }).click();
    await page.waitForURL((u) => !u.pathname.startsWith("/selecionar-cliente"), { timeout: 120_000 });
  }
  return page;
}

/** Aviso da ação na tela. Não interrompe o teste: quem prova o efeito da ação é o e-mail conferido em seguida. */
async function toast(page: Page, texto: string) {
  try {
    await page.getByText(texto).first().waitFor({ timeout: 60_000 });
  } catch {
    console.log(`  (aviso "${texto}" não apareceu; recarregamento do servidor de desenvolvimento?)`);
  }
}

async function criarDemanda(ctl: Page, assunto: string, unidade: string, prazo?: Date) {
  await ctl.goto(`${BASE}/demandas/nova`);
  await ctl.getByLabel(/Assunto/).fill(assunto);
  await ctl.getByLabel(/O que está sendo solicitado/).fill("Demanda criada pelo teste automatizado de notificações por e-mail.");
  const campo = ctl.getByLabel(/Unidade destinatária/);
  const valor = await campo.locator("option", { hasText: unidade }).first().getAttribute("value");
  await campo.selectOption(valor!);
  if (prazo) await ctl.getByLabel(/^Prazo/).fill(prazo.toISOString().slice(0, 10));
  await ctl.getByRole("button", { name: "Enviar demanda" }).click();
  await ctl.waitForURL(/\/demandas\/[0-9a-f-]{36}$/, { timeout: 120_000 });
  const numero = (await ctl.locator("dd.font-mono").first().innerText()).trim();
  return { url: ctl.url(), id: ctl.url().split("/").pop()!, numero };
}

async function pedirProrrogacao(sat: Page, dias: number) {
  await sat.getByRole("button", { name: "Pedir prorrogação" }).click();
  await sat.getByLabel(/Nova data/).fill(new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10));
  await sat.getByLabel(/Justificativa/).fill("Precisamos de mais prazo para o teste de notificações.");
  await sat.getByRole("button", { name: "Enviar pedido" }).click();
  await toast(sat, "Pedido de prorrogação enviado à controladoria.");
}

async function responder(sat: Page, texto: string) {
  await sat.getByLabel(/Sua resposta/).fill(texto);
  await sat.getByRole("button", { name: "Enviar resposta" }).click();
  await toast(sat, "Resposta enviada à controladoria.");
}

async function dialogo(ctl: Page, botao: string, campo?: [RegExp, string], confirmar = botao) {
  await ctl.getByRole("button", { name: botao, exact: true }).click();
  if (campo) await ctl.getByRole("dialog").getByLabel(campo[0]).fill(campo[1]);
  await ctl.getByRole("dialog").getByRole("button", { name: confirmar, exact: true }).click();
}

function rodarLembretes(data: string) {
  return execSync(`npx tsx scripts/lembretes-prazo.ts --data ${data}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

async function main() {
  const r = await fetch(`${MAILPIT}/api/v1/messages`, { method: "DELETE" });
  conferir("caixa do Mailpit esvaziada", r.ok);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const sufixo = Date.now().toString().slice(-6);
  // Data de referência única por execução, para o lembrete não esbarrar em registros de execuções anteriores.
  const referencia = somarDias(hojeComoDataSimples(), 400 + (Math.floor(Date.now() / 60_000) % 20_000));
  const dataRef = referencia.toISOString().slice(0, 10);
  const { controle, sesau, reg } = await destinatariosEsperados();
  conferir("seed tem controle e satélite da SESAU como destinatários", controle.includes(CONTROLADOR) && sesau.includes(SATELITE));
  try {
    const ctl = await sessao(browser, CONTROLADOR);
    const sat = await sessao(browser, SATELITE);

    // Ciclo completo de uma demanda.
    const assunto = `Teste e-mail ${sufixo}`;
    const a = await criarDemanda(ctl, assunto, "Secretaria Municipal de Saúde");
    const enviada = (await conferirEvento(`demanda enviada avisa os satélites da unidade`, sesau, `Nova demanda ${a.numero}: ${assunto}`)).find((e) => para(e, SATELITE));
    if (enviada) {
      const texto = await textoDoEmail(enviada.ID);
      conferir("e-mail traz entidade, número, assunto e prazo", ["Prefeitura Municipal de Exemplo", a.numero, assunto, "Prazo: "].every((t) => texto.includes(t)));
      conferir("e-mail traz link direto para a demanda na área do satélite", texto.includes(`${BASE}/satelite/demandas/${a.id}`));
    }

    const urlSat = a.url.replace("/demandas/", "/satelite/demandas/");
    await sat.goto(urlSat);
    await sat.getByText("Demanda visualizada pela unidade").waitFor({ timeout: 120_000 });
    await pedirProrrogacao(sat, 40);
    const pedido = (await conferirEvento("pedido de prorrogação avisa a controladoria", controle, `Pedido de prorrogação de prazo ${a.numero}`)).find((e) =>
      para(e, CONTROLADOR),
    );
    if (pedido) conferir("e-mail da controladoria aponta para a demanda na área de controle", (await textoDoEmail(pedido.ID)).includes(`${BASE}/demandas/${a.id}`));

    await ctl.goto(a.url);
    await dialogo(ctl, "Deferir prorrogação");
    await toast(ctl, "Prorrogação deferida e prazo atualizado.");
    await conferirEvento("prorrogação deferida avisa os satélites", sesau, `Prorrogação de prazo deferida ${a.numero}`);

    await sat.reload();
    await responder(sat, "Primeira resposta do teste de e-mail.");
    await conferirEvento("resposta do satélite avisa a controladoria", controle, `Demanda respondida ${a.numero}`);

    await ctl.reload();
    await dialogo(ctl, "Devolver para complementação", [/O que precisa ser complementado/, "Faltou a assinatura."]);
    await toast(ctl, "Demanda devolvida para complementação.");
    await conferirEvento("devolução avisa os satélites", sesau, `Demanda devolvida para complementação ${a.numero}`);

    await sat.reload();
    await pedirProrrogacao(sat, 50);
    await conferirEvento("segundo pedido de prorrogação avisa a controladoria", controle, `Pedido de prorrogação de prazo ${a.numero}`, 2);
    await ctl.reload();
    await dialogo(ctl, "Indeferir", [/Motivo do indeferimento/, "Prazo já foi prorrogado uma vez."]);
    await toast(ctl, "Prorrogação indeferida.");
    await conferirEvento("prorrogação indeferida avisa os satélites", sesau, `Prorrogação de prazo indeferida ${a.numero}`);

    await sat.reload();
    await responder(sat, "Segue a versão assinada.");
    await conferirEvento("nova resposta avisa a controladoria de novo", controle, `Demanda respondida ${a.numero}`, 2);
    await ctl.reload();
    await dialogo(ctl, "Aceitar e concluir");
    await toast(ctl, "Resposta aceita e demanda concluída.");
    await conferirEvento("conclusão avisa os satélites", sesau, `Demanda concluída ${a.numero}`);

    // Unidade subordinada: o escopo do satélite na SESAU cobre a Central de Regulação.
    const b = await criarDemanda(ctl, `Teste e-mail ${sufixo} lembrete 1 dia`, "Central de Regulação", somarDias(referencia, 1));
    conferir("satélite da SESAU enxerga a Central de Regulação (subordinada)", reg.includes(SATELITE));
    await conferirEvento("demanda para unidade subordinada avisa os satélites das unidades superiores", reg, `Nova demanda ${b.numero}`);
    const c = await criarDemanda(ctl, `Teste e-mail ${sufixo} lembrete 3 dias`, "Secretaria Municipal de Saúde", somarDias(referencia, 3));
    await conferirEvento("segunda demanda avisa os satélites", sesau, `Nova demanda ${c.numero}`);

    await new Promise((r) => setTimeout(r, 2_000));
    const fluxo = await caixa();
    conferir(`nenhum e-mail além dos esperados (${esperados} esperados, ${fluxo.length} recebidos)`, fluxo.length === esperados);

    // Lembretes de prazo.
    const saida1 = rodarLembretes(dataRef);
    const apos1 = await caixa();
    const lembretes = apos1.filter((e) => e.Subject.startsWith("Lembrete de prazo"));
    const satelitesLembrete = [...new Set([...sesau, ...reg])];
    conferir(
      `um lembrete para cada satélite com demanda a vencer (${dataRef})`,
      lembretes.length === satelitesLembrete.length && satelitesLembrete.every((s) => lembretes.some((e) => para(e, s))),
    );
    const lembrete = lembretes.find((e) => para(e, SATELITE));
    if (lembrete) {
      const texto = await textoDoEmail(lembrete.ID);
      conferir("lembrete lista as demandas que vencem em 1 e em 3 dias", texto.includes(b.numero) && texto.includes(c.numero) && texto.includes("vence amanhã") && texto.includes("vence em 3 dias"));
    }
    const resumos = apos1.filter((e) => e.Subject.startsWith("Resumo diário"));
    conferir("resumo de vencidas enviado a todo o controle da prefeitura", controle.every((d) => resumos.some((e) => para(e, d))));
    const textosResumo = await Promise.all(resumos.filter((e) => para(e, CONTROLADOR)).map((e) => textoDoEmail(e.ID)));
    conferir("resumo de vencidas identifica a entidade e o atraso", textosResumo.some((t) => t.includes("Prefeitura Municipal de Exemplo") && t.includes("vencida há")));
    conferir("resumo de vencidas não inclui demandas ainda no prazo", textosResumo.every((t) => !t.includes(`${c.numero} —`)));

    const saida2 = rodarLembretes(dataRef);
    const deLembrete = (lista: Email[]) => lista.filter((e) => /^(Lembrete de prazo|Resumo diário)/.test(e.Subject)).length;
    const [n1, n2] = [deLembrete(apos1), deLembrete(await caixa())];
    conferir(`segunda execução não duplica (${n1} → ${n2} e-mails de lembrete)`, n1 > 0 && n2 === n1);
    conferir("segunda execução informa que já foi enviado", saida2.includes("já enviado nesta data") && !saida1.includes("já enviado nesta data"));

    for (const d of [b, c]) {
      await ctl.goto(d.url);
      await dialogo(ctl, "Cancelar demanda", [/Motivo do cancelamento/, "Demanda de teste automatizado."]);
      await toast(ctl, "Demanda cancelada.");
    }
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
