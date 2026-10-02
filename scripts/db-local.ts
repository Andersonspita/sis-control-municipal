import "dotenv/config";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

// Fora da pasta do projeto: a sincronização do OneDrive trava os arquivos do PostgreSQL.
const baseDir = path.join(
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), ".local", "share"),
  "controladoria-municipal",
);
const databaseDir = path.join(baseDir, "pgdata");

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "postgres",
  password: process.env.LOCAL_PG_PASSWORD ?? "postgres",
  port: Number(process.env.LOCAL_PG_PORT ?? 5432),
  authMethod: "scram-sha-256",
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
});

async function main() {
  fs.mkdirSync(baseDir, { recursive: true });
  if (!fs.existsSync(path.join(databaseDir, "PG_VERSION"))) {
    console.log(`Inicializando cluster em ${databaseDir}`);
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  const { rowCount } = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = 'controladoria'",
  );
  if (!rowCount) await client.query("CREATE DATABASE controladoria");
  await client.end();

  console.log(`PostgreSQL local rodando na porta ${process.env.LOCAL_PG_PORT ?? 5432}. Ctrl+C para parar.`);

  const stop = async () => {
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch(async (err) => {
  console.error(err);
  await pg.stop().catch(() => {});
  process.exit(1);
});
