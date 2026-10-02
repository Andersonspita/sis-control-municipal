import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { importarCatalogo } from "../src/lib/catalogos/importar";

async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
  const dir = path.resolve("catalogos");
  const arquivos = process.argv.slice(2).length
    ? process.argv.slice(2)
    : fs.readdirSync(dir).filter((f) => f.endsWith(".yaml")).map((f) => path.join(dir, f));
  try {
    for (const arquivo of arquivos) {
      const r = await importarCatalogo(prisma, arquivo);
      console.log(`${r.norma}: ${r.requisitos} requisitos (${r.avaliaveis} avaliáveis)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
