import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { criarModelosBase } from "../src/lib/auditorias-modelos";

// Cria os modelos-base de checklist de auditoria nos clientes ativos que ainda não os têm (idempotente).
// Uso: npx tsx scripts/modelos-checklist.ts

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });

async function main() {
  const clientes = await prisma.cliente.findMany({ where: { ativo: true }, select: { id: true, nome: true } });
  for (const c of clientes) {
    const criados = await criarModelosBase(prisma, c.id);
    console.log(`${c.nome}: ${criados} modelo(s) criado(s)`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
