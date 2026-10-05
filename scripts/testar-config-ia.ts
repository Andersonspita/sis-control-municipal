import "dotenv/config";
import { Client } from "pg";
import { cifrar, decifrar } from "../src/lib/cripto";
import { CONTEXTO_CHAVE_EMBEDDINGS, CONTEXTO_CHAVE_IA, modeloNaLista, obterConfigIA } from "../src/lib/ia/config";
import { criarProvedor, extrairJson } from "../src/lib/ia/provedor";
import { custoTextoUsd } from "../src/lib/ia/precos";
import { mascararChave } from "../src/lib/ia/provedores";

// Verifica a cifragem das chaves de IA, os provedores (OpenAI, Anthropic, Google, compatível), a chave de
// embeddings separada e o acesso à tabela configuracoes_ia pelo papel da aplicação.
// Rodar com a condição react-server (ver npm run test:config-ia) por causa do "server-only".
// A configuração real, se existir, é restaurada ao final.

const app = new Client({ connectionString: process.env.APP_DATABASE_URL });
const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

async function lancou(fn: () => unknown) {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function comContexto<T>(cliente: string | null, usuario: string | null, perfil: string | null, fn: () => Promise<T>) {
  await app.query("BEGIN");
  try {
    await app.query(
      "SELECT set_config('app.cliente_id', $1, true), set_config('app.usuario_id', $2, true), set_config('app.perfil', $3, true)",
      [cliente ?? "", usuario ?? "", perfil ?? ""],
    );
    return await fn();
  } finally {
    await app.query("ROLLBACK");
  }
}

async function bloqueado(sql: string, params: unknown[] = []) {
  await app.query("SAVEPOINT s");
  try {
    const r = await app.query(sql, params);
    await app.query("RELEASE SAVEPOINT s");
    return r.rowCount === 0;
  } catch {
    await app.query("ROLLBACK TO SAVEPOINT s");
    return true;
  }
}

async function main() {
  const chave = `sk-proj-teste${"x".repeat(30)}abcd`;
  const cifrado = cifrar(chave, "ctx");
  conferir("cifrar/decifrar devolve a chave original", decifrar(cifrado, "ctx") === chave);
  conferir("texto cifrado não contém a chave em claro", !cifrado.includes(chave) && !cifrado.includes("sk-"));
  conferir("duas cifragens da mesma chave diferem (IV aleatório)", cifrar(chave, "ctx") !== cifrado);
  conferir("decifrar com outro contexto falha", await lancou(() => decifrar(cifrado, "outro")));
  const partes = cifrado.split(":");
  const adulterado = [...partes.slice(0, 3), Buffer.from("adulterado").toString("base64")].join(":");
  conferir("valor adulterado é rejeitado", await lancou(() => decifrar(adulterado, "ctx")));

  await app.connect();
  await dono.connect();
  const { rows: us } = await dono.query("SELECT id, email, admin_horizon FROM usuarios WHERE ativo");
  const admin = us.find((u) => u.admin_horizon)?.id as string | undefined;
  const controlador = us.find((u) => u.email.startsWith("controlador"))!.id as string;
  const satelite = us.find((u) => u.email.startsWith("saude"))!.id as string;
  const { rows: clientes } = await dono.query("SELECT id FROM clientes WHERE tipo = 'PREFEITURA' LIMIT 1");
  const pm = clientes[0].id as string;

  // Linha de teste gravada pelo dono (fora da RLS); a configuração real, se houver, é restaurada no fim.
  const COLUNAS =
    "habilitada, provedor, url_base, chave_cifrada, chave_final, modelo_texto, modelo_embeddings, provedor_embeddings, url_base_embeddings, chave_embeddings_cifrada, chave_embeddings_final";
  const { rows: existentes } = await dono.query(`SELECT ${COLUNAS} FROM configuracoes_ia WHERE id = 1`);
  const original = existentes[0] as Record<string, unknown> | undefined;
  await dono.query(
    "INSERT INTO configuracoes_ia (id, habilitada, chave_cifrada, chave_final, atualizado_em) VALUES (1, true, $1, 'abcd', now()) ON CONFLICT (id) DO UPDATE SET chave_cifrada = EXCLUDED.chave_cifrada, chave_final = EXCLUDED.chave_final",
    [cifrado],
  );

  try {
    const { rows } = await dono.query("SELECT row_to_json(c)::text AS linha FROM configuracoes_ia c");
    conferir("linha gravada no banco não contém a chave em claro", !rows[0].linha.includes(chave));

    await comContexto(pm, controlador, "CONTROLADOR", async () => {
      conferir("controlador não lê configuracoes_ia", await bloqueado("SELECT * FROM configuracoes_ia"));
      conferir("controlador não altera configuracoes_ia", await bloqueado("UPDATE configuracoes_ia SET habilitada = false"));
    });
    await comContexto(pm, satelite, "SATELITE", async () => {
      conferir("satélite não lê configuracoes_ia", await bloqueado("SELECT * FROM configuracoes_ia"));
    });
    await comContexto(null, controlador, "ADMIN_HORIZON", async () => {
      conferir("perfil ADMIN_HORIZON forjado (sem admin_horizon) não lê", await bloqueado("SELECT * FROM configuracoes_ia"));
    });
    await comContexto(null, null, null, async () => {
      conferir("código do servidor sem contexto lê a configuração", !(await bloqueado("SELECT * FROM configuracoes_ia")));
      conferir("sem contexto não altera a configuração", await bloqueado("UPDATE configuracoes_ia SET habilitada = false"));
    });
    if (admin) {
      await comContexto(null, admin, "ADMIN_HORIZON", async () => {
        conferir("administrador lê a configuração", !(await bloqueado("SELECT * FROM configuracoes_ia")));
        conferir("administrador altera a configuração", !(await bloqueado("UPDATE configuracoes_ia SET habilitada = false")));
      });
    } else {
      console.log("AVISO nenhum administrador ativo no banco; testes do administrador ignorados.");
    }

    // ── Multiprovedor ──
    const restricao = async (sql: string) => lancou(() => dono.query(sql));
    conferir("provedor desconhecido é recusado pelo banco", await restricao("UPDATE configuracoes_ia SET provedor = 'XPTO' WHERE id = 1"));
    conferir(
      "provedor compatível sem URL base é recusado pelo banco",
      await restricao("UPDATE configuracoes_ia SET provedor = 'OPENAI_COMPATIVEL', url_base = NULL WHERE id = 1"),
    );
    conferir(
      "Anthropic não é aceita como provedor de embeddings",
      await restricao("UPDATE configuracoes_ia SET provedor_embeddings = 'ANTHROPIC' WHERE id = 1"),
    );

    const chaveAnthropic = `sk-ant-api03-teste${"y".repeat(30)}wxyz`;
    const chaveEmb = `sk-proj-emb${"z".repeat(30)}efgh`;
    const cifradaTexto = cifrar(chaveAnthropic, CONTEXTO_CHAVE_IA);
    const cifradaEmb = cifrar(chaveEmb, CONTEXTO_CHAVE_EMBEDDINGS);
    await dono.query(
      `UPDATE configuracoes_ia SET habilitada = true, provedor = 'ANTHROPIC', url_base = NULL, chave_cifrada = $1, chave_final = 'wxyz',
         modelo_texto = 'claude-sonnet-4-5', modelo_embeddings = 'text-embedding-3-small', provedor_embeddings = 'OPENAI',
         url_base_embeddings = NULL, chave_embeddings_cifrada = $2, chave_embeddings_final = 'efgh' WHERE id = 1`,
      [cifradaTexto, cifradaEmb],
    );
    const { rows: r2 } = await dono.query("SELECT row_to_json(c)::text AS linha FROM configuracoes_ia c");
    conferir("chave de embeddings não fica em claro no banco", !r2[0].linha.includes(chaveEmb) && !r2[0].linha.includes(chaveAnthropic));
    conferir("chave de embeddings não decifra com o contexto da chave de texto", await lancou(() => decifrar(cifradaEmb, CONTEXTO_CHAVE_IA)));

    const cfg = await obterConfigIA();
    conferir("obterConfigIA lê o provedor ANTHROPIC", cfg.provedor === "ANTHROPIC" && cfg.chave === chaveAnthropic && cfg.origemChave === "banco");
    conferir(
      "obterConfigIA lê embeddings separados (OpenAI, chave própria)",
      cfg.embeddings?.provedor === "OPENAI" && cfg.embeddings.chave === chaveEmb && cfg.embeddings.separado && cfg.embeddings.origemChave === "banco",
    );
    conferir("configuração Anthropic + embeddings OpenAI fica habilitada", cfg.habilitada && cfg.pendencia === null);
    const falsoAntes = process.env.IA_PROVEDOR;
    process.env.IA_PROVEDOR = "";
    try {
      conferir("criarProvedor usa a Anthropic para o texto", criarProvedor(cfg).nome === "anthropic");
      conferir("criarProvedor(chave) continua criando OpenAI", criarProvedor(chave).nome === "openai");
    } finally {
      process.env.IA_PROVEDOR = falsoAntes;
    }

    await dono.query(
      "UPDATE configuracoes_ia SET provedor_embeddings = NULL, chave_embeddings_cifrada = NULL, chave_embeddings_final = NULL WHERE id = 1",
    );
    const semEmb = await obterConfigIA();
    conferir("Anthropic sem provedor de embeddings fica indisponível, com motivo", !semEmb.habilitada && semEmb.embeddings === null && Boolean(semEmb.pendencia));

    await dono.query(
      "UPDATE configuracoes_ia SET provedor = 'OPENAI_COMPATIVEL', url_base = 'http://localhost:11434/v1', chave_cifrada = NULL, chave_final = NULL, modelo_texto = 'llama3.1:8b' WHERE id = 1",
    );
    const compat = await obterConfigIA();
    conferir(
      "compatível sem chave (ex.: Ollama) fica habilitado e reaproveita a conexão nos embeddings",
      compat.habilitada && compat.urlBase === "http://localhost:11434/v1" && compat.embeddings?.separado === false,
    );

    await comContexto(pm, controlador, "CONTROLADOR", async () => {
      conferir("controlador continua sem ler as colunas novas", await bloqueado("SELECT chave_embeddings_cifrada FROM configuracoes_ia"));
    });

    conferir("modeloNaLista aceita apelido de versão datada", modeloNaLista("claude-sonnet-4-5", ["claude-sonnet-4-5-20250929"]));
    conferir("modeloNaLista recusa modelo ausente", !modeloNaLista("gpt-9", ["gpt-4.1"]));
    conferir("extrairJson lê JSON cercado por ```json", (extrairJson('```json\n{"a":1}\n```') as { a: number }).a === 1);
    conferir("preço do Claude Sonnet 4.5 (datado) vem da tabela", Math.abs(custoTextoUsd("claude-sonnet-4-5-20250929", 1_000_000, 0) - 3) < 1e-9);
    conferir("preço ignora prefixo do OpenRouter", Math.abs(custoTextoUsd("openai/gpt-4.1-mini", 1_000_000, 0) - 0.4) < 1e-9);
    conferir("máscara da chave por provedor", mascararChave("wxyz", "ANTHROPIC") === "sk-ant-…wxyz" && mascararChave("abcd", "GOOGLE") === "…abcd");
  } finally {
    if (original) {
      const valores = Object.values(original);
      await dono.query(
        `UPDATE configuracoes_ia SET (${COLUNAS}) = (${valores.map((_, i) => `$${i + 1}`).join(", ")}) WHERE id = 1`,
        valores,
      );
    } else {
      await dono.query("DELETE FROM configuracoes_ia WHERE id = 1");
    }
  }

  await app.end();
  await dono.end();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
