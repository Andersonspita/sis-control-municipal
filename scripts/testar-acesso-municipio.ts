import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hash } from "@node-rs/argon2";
import { Client } from "pg";
import { chromium, type Page } from "playwright";

// Link de acesso por município (/m/<slug>): quem não tem vínculo no município recebe a mesma mensagem de
// credenciais inválidas (e conta para o limitador), slug inexistente dá 404, administrador sempre entra,
// a sessão fica restrita ao município e o logout volta ao link.
// Requer `npm run dev` e pelo menos dois municípios com entidades ativas. Cria usuários temporários
// (removidos ao final).

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SENHA = "Teste@Municipio1";
const ERRO_LOGIN = "E-mail ou senha inválidos.";
const dono = new Client({ connectionString: process.env.DATABASE_URL });
const criados: string[] = [];
let falhas = 0;

function conferir(descricao: string, ok: boolean) {
  console.log(`${ok ? "OK   " : "FALHA"} ${descricao}`);
  if (!ok) falhas++;
}

async function criarUsuario(rotulo: string, clienteIds: string[], admin = false) {
  const id = randomUUID();
  const email = `acesso-${rotulo}-${id.slice(0, 8)}@teste.invalid`;
  const senhaHash = await hash(SENHA, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await dono.query(
    "INSERT INTO usuarios (id, nome, email, senha_hash, admin_horizon, atualizado_em) VALUES ($1, $2, $3, $4, $5, now())",
    [id, `Teste ${rotulo}`, email, senhaHash, admin],
  );
  for (const clienteId of clienteIds) {
    await dono.query("INSERT INTO vinculos_cliente (id, usuario_id, cliente_id, perfil) VALUES ($1, $2, $3, 'CONTROLADOR')", [
      randomUUID(),
      id,
      clienteId,
    ]);
  }
  criados.push(id);
  return { id, email };
}

async function entrar(page: Page, caminho: string, email: string, senha = SENHA) {
  await page.goto(`${BASE}${caminho}`);
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(senha);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function mensagemErro(page: Page) {
  const alerta = page.locator("form [role=alert]");
  await alerta.waitFor({ timeout: 30_000 });
  return (await alerta.innerText()).trim();
}

async function main() {
  await dono.connect();
  const { rows: municipios } = await dono.query<{ id: string; slug: string; nome: string; clientes: string[] }>(`
    SELECT m.id, m.slug, m.nome, array_agg(c.id ORDER BY c.tipo, c.nome) AS clientes
    FROM municipios m JOIN clientes c ON c.municipio_id = m.id AND c.ativo
    WHERE m.ativo GROUP BY m.id ORDER BY count(c.id) DESC, m.slug LIMIT 2`);
  if (municipios.length < 2 || municipios[0].clientes.length < 2) {
    throw new Error("São necessários dois municípios ativos, o primeiro com ao menos duas entidades ativas.");
  }
  const [alvo, outro] = municipios;
  const caminho = `/m/${alvo.slug}`;
  console.log(`Município testado: ${alvo.nome} (${caminho}); outro: ${outro.nome}`);

  const local = await criarUsuario("local", [alvo.clientes[0]]);
  const multi = await criarUsuario("multi", [...alvo.clientes, outro.clientes[0]]);
  const fora = await criarUsuario("fora", [outro.clientes[0]]);
  const foraLimite = await criarUsuario("fora-limite", [outro.clientes[0]]);
  const admin = await criarUsuario("admin", [], true);

  const browser = await chromium.launch({ channel: "msedge", headless: true });
  const novaPagina = async () => (await browser.newContext({ locale: "pt-BR" })).newPage();

  try {
    const page = await novaPagina();

    const r404 = await page.goto(`${BASE}/m/municipio-inexistente-zz`);
    conferir("slug inexistente responde 404", r404?.status() === 404);
    const r404b = await page.goto(`${BASE}/m/Slug_Inválido`);
    conferir("slug malformado responde 404", r404b?.status() === 404);

    const r = await page.goto(`${BASE}${caminho}`);
    conferir("página do município responde 200 sem sessão", r?.status() === 200);
    conferir("página mostra o nome do município", await page.getByText(alvo.nome, { exact: false }).first().isVisible());

    // Sem vínculo no município: senha certa e senha errada recebem a mesma mensagem.
    await entrar(page, caminho, fora.email);
    const msgBloqueado = await mensagemErro(page);
    conferir("usuário de outro município é bloqueado", new URL(page.url()).pathname === caminho);
    await entrar(page, caminho, fora.email, "senha-errada-123");
    const msgSenhaErrada = await mensagemErro(page);
    conferir(`bloqueio e senha errada têm a mesma mensagem ("${msgBloqueado}")`, msgBloqueado === msgSenhaErrada && msgBloqueado === ERRO_LOGIN);
    const { rowCount } = await dono.query("SELECT 1 FROM log_auditoria WHERE acao = 'login.bloqueado_municipio' AND usuario_id = $1", [fora.id]);
    conferir("tentativa bloqueada fica registrada na trilha", (rowCount ?? 0) > 0);

    // O bloqueio conta para o limitador de tentativas (5 em 15 minutos).
    for (let i = 0; i < 5; i++) {
      await entrar(page, caminho, foraLimite.email);
      await mensagemErro(page);
    }
    await entrar(page, caminho, foraLimite.email);
    conferir("bloqueios por município contam para o limitador", (await mensagemErro(page)).startsWith("Muitas tentativas"));

    // O mesmo usuário entra normalmente pelo login geral.
    const pageGeral = await novaPagina();
    await entrar(pageGeral, "/login", fora.email);
    await pageGeral.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30_000 });
    conferir("usuário bloqueado no link entra pelo /login geral", !pageGeral.url().includes("/login"));

    // Um vínculo no município: entra direto; logout volta ao link.
    const pageLocal = await novaPagina();
    await entrar(pageLocal, caminho, local.email);
    await pageLocal.waitForURL(/\/painel/, { timeout: 30_000 });
    conferir("usuário com um vínculo no município entra direto no painel", true);
    await pageLocal.getByRole("button", { name: /Menu do usuário/ }).click();
    await pageLocal.getByRole("menuitem", { name: "Sair" }).click();
    await pageLocal.waitForURL((u) => u.pathname === caminho, { timeout: 30_000 });
    conferir("logout de quem entrou pelo link volta ao link do município", true);

    // Vários vínculos: a seleção mostra só as entidades do município, com opção de ver todas.
    const pageMulti = await novaPagina();
    await entrar(pageMulti, caminho, multi.email);
    await pageMulti.waitForURL(/\/selecionar-cliente/, { timeout: 30_000 });
    const nomes = (await dono.query<{ id: string; nome: string }>("SELECT id, nome FROM clientes WHERE id = ANY($1)", [[...alvo.clientes, outro.clientes[0]]])).rows;
    const nomeDe = (id: string) => nomes.find((n) => n.id === id)!.nome;
    const opcoes = await pageMulti.locator("main form button[type=submit]").allInnerTexts();
    conferir(
      "seleção lista só entidades do município",
      alvo.clientes.every((id) => opcoes.some((t) => t.includes(nomeDe(id)))) && !opcoes.some((t) => t.includes(nomeDe(outro.clientes[0]))),
    );
    conferir("opção \"Ver todas as entidades\" aparece", await pageMulti.getByRole("button", { name: "Ver todas as entidades" }).isVisible());

    // Sessão restrita não abre entidade de outro município, mesmo forçando o cliente ativo.
    await dono.query("UPDATE sessoes SET cliente_ativo_id = $1 WHERE usuario_id = $2", [outro.clientes[0], multi.id]);
    await pageMulti.goto(`${BASE}/painel`);
    await pageMulti.waitForURL(/\/selecionar-cliente/, { timeout: 30_000 });
    conferir("sessão restrita não acessa entidade de outro município", true);

    await pageMulti.getByRole("button", { name: "Ver todas as entidades" }).click();
    await pageMulti.waitForURL(/\/login$/, { timeout: 30_000 });
    conferir("\"Ver todas\" leva ao login geral", true);

    // Administrador HorizonAJ entra por qualquer link, mesmo sem vínculo.
    const pageAdmin = await novaPagina();
    await entrar(pageAdmin, `/m/${outro.slug}`, admin.email);
    const entrou = await pageAdmin
      .waitForURL(/\/admin/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    conferir(`administrador sem vínculo entra pelo link do município (${new URL(pageAdmin.url()).pathname})`, entrou);
  } finally {
    await browser.close();
    if (criados.length) {
      await dono.query("DELETE FROM usuarios WHERE id = ANY($1)", [criados]);
    }
    await dono.end();
  }

  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
