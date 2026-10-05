import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { executarSincronizacao, iniciarSincronizacao } from "../src/lib/integracoes/sincronizar";

// Sincroniza os dados externos (IBGE, SICONFI e Portal da Transparência) de todos os clientes ativos
// com código IBGE, um de cada vez (as APIs públicas têm limite de requisições).
//
// Uso: npm run integracoes:sincronizar [-- --cliente <uuid>]
//
// Cron na VPS (todo dia às 6h; ajuste ao fuso do servidor), a partir da pasta do projeto:
//   0 6 * * * cd /opt/controladoria && docker compose -f docker-compose.prod.yml run --rm app npm run integracoes:sincronizar >> /var/log/controladoria/integracoes.log 2>&1
//
// Usa APP_DATABASE_URL (papel sujeito a RLS) com o contexto do cliente por transação. O Portal da Transparência
// só é consultado se PORTAL_TRANSPARENCIA_CHAVE estiver definida. Cada execução fica na trilha do cliente
// (ação "integracoes.sincronizadas", origem AGENDADA).

const { values } = parseArgs({ options: { cliente: { type: "string" } } });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.APP_DATABASE_URL!, options: "-c TimeZone=UTC" }),
});

function comCliente<T>(clienteId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.cliente_id', ${clienteId}, true),
        set_config('app.usuario_id', '', true),
        set_config('app.perfil', 'CONTROLADOR', true)`;
      return fn(tx);
    },
    { timeout: 30_000 },
  );
}

async function main() {
  const clientes = await prisma.cliente.findMany({
    where: { ativo: true, codigoIbge: { not: null }, ...(values.cliente && { id: values.cliente }) },
    select: { id: true, nome: true, tipo: true, cnpj: true, municipio: true, codigoIbge: true },
    orderBy: [{ municipio: "asc" }, { nome: "asc" }],
  });
  if (!clientes.length) {
    console.log("Nenhum cliente ativo com código IBGE.");
    return;
  }

  let falhas = 0;
  for (const cliente of clientes) {
    const inicio = Date.now();
    try {
      const iniciou = await comCliente(cliente.id, (tx) => iniciarSincronizacao(tx, cliente.id, null));
      if (!iniciou) {
        console.log(`${cliente.nome}: sincronização já em andamento, pulando.`);
        continue;
      }
      const resumo = await executarSincronizacao({
        cliente,
        usuarioId: null,
        origem: "AGENDADA",
        executar: (fn) => comCliente(cliente.id, fn),
      });
      const linha = Object.entries(resumo)
        .map(([fonte, r]) => `${fonte}=${r.status}${r.status === "ERRO" ? ` (${r.erro})` : ""}`)
        .join(" ");
      if (Object.values(resumo).some((r) => r.status === "ERRO")) falhas++;
      console.log(`${cliente.nome} [${cliente.codigoIbge}] ${linha} — ${((Date.now() - inicio) / 1000).toFixed(1)}s`);
    } catch (err) {
      falhas++;
      console.error(`${cliente.nome}: falha inesperada`, err);
    }
  }
  console.log(`\n${clientes.length} cliente(s) processado(s); ${falhas} com falha.`);
  process.exitCode = falhas ? 1 : 0;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
