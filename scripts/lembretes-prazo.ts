import "dotenv/config";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "../src/generated/prisma/client";
import { hojeComoDataSimples, somarDias } from "../src/lib/datas";
import { STATUS_ABERTOS, STATUS_AGUARDANDO_UNIDADE } from "../src/lib/demandas";
import { destinatariosControle, resolvedorSatelites } from "../src/lib/email/destinatarios";
import { modeloResumo, type ItemResumo } from "../src/lib/email/modelos";
import { enviarEmails, urlApp, type Mensagem } from "../src/lib/email/transporte";

// Lembretes diários de prazo das demandas, por cliente ativo:
// - aos satélites: demandas aguardando a unidade que vencem em 3 dias e em 1 dia (um e-mail por pessoa);
// - à controladoria (controladores e equipe): resumo das demandas abertas já vencidas.
//
// Uso: npm run lembretes:prazo [-- --data AAAA-MM-DD]
//   --data  data de referência (padrão: hoje no fuso de Brasília); serve para reprocessar um dia que falhou.
//
// Cron na VPS (todo dia às 7h de Brasília), a partir da pasta do projeto:
//   0 7 * * * cd /caminho/do/projeto && npm run lembretes:prazo >> /var/log/controladoria-lembretes.log 2>&1
// (ajuste o horário ao fuso do servidor; com TZ=UTC, use "0 10 * * *").
//
// Não duplica: ao enviar, registra na trilha de auditoria do cliente a ação "demanda.lembrete_enviado"
// com a data de referência em entidade_id, e pula o cliente se esse registro já existir.
// Se todos os envios do cliente falharem, nada é registrado e a próxima execução tenta de novo.
// Usa APP_DATABASE_URL (papel sujeito a RLS) com o contexto do cliente definido por transação.
// Variáveis de e-mail: SMTP_*, EMAIL_REMETENTE e APP_URL (ver .env.example).

const ACAO = "demanda.lembrete_enviado";
const DIAS_LEMBRETE = [3, 1];

const { values } = parseArgs({ options: { data: { type: "string" } } });

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

function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`;
}

function situacao(dias: number) {
  if (dias === 1) return "vence amanhã";
  if (dias > 1) return `vence em ${dias} dias`;
  return `vencida há ${plural(-dias, "dia", "dias")}`;
}

async function processarCliente(cliente: { id: string; nome: string }, referencia: Date) {
  const dataRef = referencia.toISOString().slice(0, 10);
  const lido = await comCliente(cliente.id, async (tx) => {
    const jaEnviado = await tx.logAuditoria.findFirst({ where: { acao: ACAO, entidadeId: dataRef }, select: { id: true } });
    if (jaEnviado) return null;
    const demandas = await tx.demanda.findMany({
      where: {
        status: { in: STATUS_ABERTOS },
        OR: [{ prazo: { in: DIAS_LEMBRETE.map((d) => somarDias(referencia, d)) } }, { prazo: { lt: referencia } }],
      },
      select: { id: true, numero: true, ano: true, assunto: true, prazo: true, status: true, unidadeDestino: { select: { id: true, nome: true } } },
      orderBy: [{ prazo: "asc" }, { ano: "asc" }, { numero: "asc" }],
    });
    return { demandas, satelitesDe: await resolvedorSatelites(tx), controle: await destinatariosControle(tx, cliente.id) };
  });
  if (!lido) return { cliente: cliente.nome, situacao: "já enviado nesta data" };

  const item = (d: (typeof lido.demandas)[number], caminho: string): ItemResumo => {
    const dias = Math.round((d.prazo.getTime() - referencia.getTime()) / 86_400_000);
    return { ...d, unidade: d.unidadeDestino.nome, link: urlApp(caminho), situacao: situacao(dias) };
  };

  // Lembrete só para quem precisa agir: demandas já respondidas aguardam a controladoria, não a unidade.
  const proximas = lido.demandas.filter((d) => STATUS_AGUARDANDO_UNIDADE.includes(d.status) && d.prazo >= referencia);
  const porSatelite = new Map<string, ItemResumo[]>();
  for (const d of proximas) {
    const i = item(d, `/satelite/demandas/${d.id}`);
    for (const s of lido.satelitesDe(d.unidadeDestino.id)) porSatelite.set(s.email, [...(porSatelite.get(s.email) ?? []), i]);
  }
  const vencidas = lido.demandas.filter((d) => d.prazo < referencia).map((d) => item(d, `/demandas/${d.id}`));

  const mensagens: Mensagem[] = [];
  for (const [email, itens] of porSatelite) {
    mensagens.push({
      para: email,
      ...modeloResumo({
        assunto: `Lembrete de prazo: ${plural(itens.length, "demanda vence", "demandas vencem")} em breve`,
        titulo: "Demandas com prazo próximo",
        cliente: cliente.nome,
        introducao: "As demandas abaixo aguardam resposta da sua unidade e o prazo está chegando.",
        itens,
        link: urlApp("/satelite"),
        rotuloLink: "Abrir a caixa de demandas",
      }),
    });
  }
  if (vencidas.length) {
    const resumo = modeloResumo({
      assunto: `Resumo diário: ${plural(vencidas.length, "demanda vencida", "demandas vencidas")}`,
      titulo: `${plural(vencidas.length, "demanda aberta está vencida", "demandas abertas estão vencidas")}`,
      cliente: cliente.nome,
      introducao: "Estas demandas passaram do prazo e ainda não foram concluídas.",
      itens: vencidas,
      link: urlApp("/demandas?vencidas=1"),
      rotuloLink: "Ver demandas vencidas",
    });
    for (const c of lido.controle) mensagens.push({ para: c.email, ...resumo });
  }
  if (!mensagens.length) return { cliente: cliente.nome, situacao: "nada a enviar" };

  const { enviados, falhas } = await enviarEmails(mensagens);
  if (!enviados) return { cliente: cliente.nome, situacao: `todos os ${falhas} envios falharam; será tentado de novo` };

  await comCliente(cliente.id, (tx) =>
    tx.logAuditoria.createMany({
      data: [
        {
          clienteId: cliente.id,
          acao: ACAO,
          entidade: "LembretePrazo",
          entidadeId: dataRef,
          dados: {
            data: dataRef,
            emails: enviados,
            falhas,
            satelites: porSatelite.size,
            demandasProximas: proximas.length,
            vencidas: vencidas.length,
          },
        },
      ],
    }),
  );
  return { cliente: cliente.nome, situacao: `${plural(enviados, "e-mail enviado", "e-mails enviados")}${falhas ? `, ${falhas} com falha` : ""}` };
}

async function main() {
  if (values.data && !/^\d{4}-\d{2}-\d{2}$/.test(values.data)) throw new Error("Use --data no formato AAAA-MM-DD.");
  const referencia = values.data ? new Date(values.data) : hojeComoDataSimples();
  const clientes = await prisma.cliente.findMany({ where: { ativo: true }, select: { id: true, nome: true }, orderBy: { nome: "asc" } });
  console.log(`Lembretes de prazo de ${referencia.toISOString().slice(0, 10)} (${clientes.length} clientes ativos)`);
  let erros = 0;
  for (const c of clientes) {
    try {
      const r = await processarCliente(c, referencia);
      console.log(`- ${r.cliente}: ${r.situacao}`);
    } catch (err) {
      erros++;
      console.error(`- ${c.nome}: erro`, err);
    }
  }
  if (erros) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
