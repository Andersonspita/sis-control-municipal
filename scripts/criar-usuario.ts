import "dotenv/config";
import { parseArgs } from "node:util";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Perfil } from "../src/generated/prisma/client";

// Uso: npm run usuario:criar -- --email x@y --senha ... --nome "Fulano" [--admin] [--perfil CONTROLADOR] [--clientes todos|cnpj1,cnpj2]
const { values } = parseArgs({
  options: {
    email: { type: "string" },
    senha: { type: "string" },
    nome: { type: "string" },
    admin: { type: "boolean", default: false },
    perfil: { type: "string" },
    clientes: { type: "string", default: "todos" },
    cargo: { type: "string" },
  },
});

const PERFIS: Perfil[] = ["CONTROLADOR", "EQUIPE", "SATELITE"];

async function main() {
  const email = values.email?.trim().toLowerCase();
  const { senha, nome } = values;
  if (!email || !senha || !nome) throw new Error("Informe --email, --senha e --nome.");
  if (senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");
  const perfil = values.perfil as Perfil | undefined;
  if (perfil && !PERFIS.includes(perfil)) throw new Error(`Perfil inválido. Use: ${PERFIS.join(", ")}.`);
  if (perfil === "SATELITE") throw new Error("Satélites precisam de unidade de escopo; cadastre pela interface.");

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
  try {
    const senhaHash = await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
    const usuario = await prisma.usuario.upsert({
      where: { email },
      create: { email, nome, senhaHash, adminHorizon: values.admin },
      update: { nome, senhaHash, adminHorizon: values.admin, ativo: true },
    });
    console.log(`Usuário ${usuario.email} pronto${values.admin ? " (admin HorizonAJ)" : ""}.`);

    if (!perfil) return;
    const clientes = await prisma.cliente.findMany({
      where: values.clientes === "todos" ? {} : { cnpj: { in: values.clientes.split(",").map((c) => c.trim()) } },
      select: { id: true, nome: true },
    });
    for (const c of clientes) {
      await prisma.vinculoCliente.upsert({
        where: { usuarioId_clienteId: { usuarioId: usuario.id, clienteId: c.id } },
        create: { usuarioId: usuario.id, clienteId: c.id, perfil, cargo: values.cargo },
        update: { perfil, cargo: values.cargo, ativo: true },
      });
      console.log(`  ${perfil} em ${c.nome}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
