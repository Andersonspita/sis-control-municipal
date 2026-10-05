import "dotenv/config";
import { Client } from "pg";
import { cifrar, decifrar } from "../src/lib/cripto";

// Verifica a cifragem da chave da OpenAI e o acesso à tabela configuracoes_ia pelo papel da aplicação.
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
  const { rows: existentes } = await dono.query(
    "SELECT habilitada, chave_cifrada, chave_final FROM configuracoes_ia WHERE id = 1",
  );
  const original = existentes[0] as { habilitada: boolean; chave_cifrada: string | null; chave_final: string | null } | undefined;
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
  } finally {
    if (original) {
      await dono.query(
        "UPDATE configuracoes_ia SET habilitada = $1, chave_cifrada = $2, chave_final = $3 WHERE id = 1",
        [original.habilitada, original.chave_cifrada, original.chave_final],
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
