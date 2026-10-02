import "dotenv/config";
import { Client } from "pg";

// Cria/atualiza o papel da aplicação. Precisa rodar antes de `prisma migrate`,
// porque as migrações concedem privilégios e criam políticas para esse papel.
async function main() {
  const user = process.env.APP_DB_USER;
  const password = process.env.APP_DB_PASSWORD;
  if (!user || !password) throw new Error("APP_DB_USER e APP_DB_PASSWORD são obrigatórios");
  if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error("APP_DB_USER inválido");

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [user]);
    const verbo = rowCount ? "ALTER" : "CREATE";
    const senha = password.replace(/'/g, "''");
    await client.query(
      `${verbo} ROLE ${user} WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD '${senha}'`,
    );
    const { rows } = await client.query("SELECT current_database() AS db, current_user AS dono");
    const { db, dono } = rows[0];
    await client.query(`GRANT CONNECT ON DATABASE "${db}" TO ${user}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${user}`);
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${dono}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${user}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES FOR ROLE "${dono}" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ${user}`,
    );
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${user}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${user}`);
    console.log(`Papel ${user} pronto no banco ${db}.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
