import "dotenv/config";
import { Client } from "pg";

// Verifica as políticas de isolamento conectando com o papel da aplicação (sem BYPASSRLS).
// Requer o seed de demonstração.

const app = new Client({ connectionString: process.env.APP_DATABASE_URL });
const dono = new Client({ connectionString: process.env.DATABASE_URL });
let falhas = 0;

function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
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

async function contar(sql: string, params: unknown[] = []) {
  const { rows } = await app.query(`SELECT count(*)::int AS n FROM (${sql}) t`, params);
  return rows[0].n as number;
}

async function main() {
  await app.connect();
  await dono.connect();

  const { rows: clientes } = await dono.query("SELECT id, tipo FROM clientes ORDER BY tipo");
  const pm = clientes.find((c) => c.tipo === "PREFEITURA")!.id as string;
  const cm = clientes.find((c) => c.tipo === "CAMARA")!.id as string;
  const { rows: us } = await dono.query("SELECT id, email FROM usuarios");
  const controlador = us.find((u) => u.email.startsWith("controlador"))!.id as string;
  const satelite = us.find((u) => u.email.startsWith("saude"))!.id as string;
  const { rows: tot } = await dono.query(
    "SELECT (SELECT count(*) FROM unidades WHERE cliente_id = $1)::int AS un_pm, (SELECT count(*) FROM demandas WHERE cliente_id = $1)::int AS dem_pm",
    [pm],
  );

  const { rows: papel } = await app.query("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user");
  conferir("papel da aplicação não é superusuário nem ignora RLS", !papel[0].rolbypassrls && !papel[0].rolsuper);

  await comContexto(null, null, null, async () => {
    conferir("sem contexto: nenhuma unidade visível", (await contar("SELECT * FROM unidades")) === 0);
    conferir("sem contexto: nenhuma demanda visível", (await contar("SELECT * FROM demandas")) === 0);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    conferir("controlador na PM vê todas as unidades da PM", (await contar("SELECT * FROM unidades")) === tot[0].un_pm);
    conferir("controlador na PM não vê unidades da Câmara", (await contar("SELECT * FROM unidades WHERE cliente_id = $1", [cm])) === 0);
    conferir("controlador na PM vê todas as demandas da PM", (await contar("SELECT * FROM demandas")) === tot[0].dem_pm);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    let bloqueado = false;
    try {
      await app.query("SAVEPOINT s");
      await app.query("INSERT INTO unidades (id, cliente_id, nome) VALUES (gen_random_uuid(), $1, 'Intrusa')", [cm]);
    } catch {
      bloqueado = true;
      await app.query("ROLLBACK TO SAVEPOINT s");
    }
    conferir("inserção com cliente_id de outro cliente é bloqueada", bloqueado);
  });

  await comContexto(pm, satelite, "SATELITE", async () => {
    const { rows } = await app.query("SELECT sigla FROM unidades ORDER BY sigla");
    const siglas = rows.map((r) => r.sigla).join(",");
    conferir(`satélite vê só a Saúde e subordinadas (${siglas})`, siglas === "REG,SESAU");
    const { rows: dem } = await app.query("SELECT assunto FROM demandas");
    conferir("satélite vê só a demanda destinada à Saúde", dem.length === 1 && dem[0].assunto.includes("regulação"));
    conferir("satélite não vê ciclos de avaliação", (await contar("SELECT * FROM ciclos_avaliacao")) === 0);
    conferir("satélite não lê a trilha de auditoria", (await contar("SELECT * FROM log_auditoria")) === 0);
  });

  await comContexto(cm, satelite, "SATELITE", async () => {
    conferir("satélite sem vínculo na Câmara não vê nada lá", (await contar("SELECT * FROM unidades")) === 0);
  });

  await comContexto(pm, controlador, "CONTROLADOR", async () => {
    let bloqueado = false;
    try {
      await app.query("SAVEPOINT s");
      await app.query("UPDATE tramitacoes_demanda SET texto = 'alterado'");
    } catch {
      bloqueado = true;
      await app.query("ROLLBACK TO SAVEPOINT s");
    }
    conferir("histórico de tramitação é imutável", bloqueado);
  });

  await app.end();
  await dono.end();
  console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
  process.exit(falhas ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
