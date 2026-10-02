import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { importarCatalogo } from "../src/lib/catalogos/importar";

if (process.env.NODE_ENV === "production") {
  console.error("Seed de demonstração não pode rodar em produção.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });
const SENHA_DEMO = "Demo@2026";

async function usuario(email: string, nome: string, adminHorizon = false) {
  const senhaHash = await hash(SENHA_DEMO, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  return prisma.usuario.upsert({
    where: { email },
    create: { email, nome, senhaHash, adminHorizon },
    update: { nome, adminHorizon },
  });
}

async function cliente(dados: {
  cnpj: string;
  nome: string;
  tipo: "PREFEITURA" | "CAMARA";
  populacao: number;
}) {
  return prisma.cliente.upsert({
    where: { cnpj: dados.cnpj },
    create: { ...dados, municipio: "Município Exemplo", uf: "BA" },
    update: {},
  });
}

async function unidade(clienteId: string, nome: string, sigla: string, responsavel?: string) {
  const existente = await prisma.unidade.findFirst({ where: { clienteId, sigla } });
  if (existente) return existente;
  return prisma.unidade.create({
    data: { clienteId, nome, sigla, tipo: "SECRETARIA", responsavelNome: responsavel },
  });
}

async function main() {
  const dir = path.resolve("catalogos");
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".yaml"))) {
    const r = await importarCatalogo(prisma, path.join(dir, f));
    console.log(`Catálogo ${r.norma}: ${r.requisitos} requisitos`);
  }

  const pm = await cliente({ cnpj: "00000000000191", nome: "Prefeitura Municipal de Exemplo", tipo: "PREFEITURA", populacao: 48000 });
  const cm = await cliente({ cnpj: "00000000000272", nome: "Câmara Municipal de Exemplo", tipo: "CAMARA", populacao: 48000 });

  const admin = await usuario("admin@horizonaj.com.br", "Administrador HorizonAJ", true);
  const controlador = await usuario("controlador@exemplo.ba.gov.br", "Maria Controladora");
  const satelite = await usuario("saude@exemplo.ba.gov.br", "João Secretário de Saúde");

  for (const [u, c, perfil, cargo] of [
    [controlador, pm, "CONTROLADOR", "Controladora-Geral do Município"],
    [controlador, cm, "CONTROLADOR", "Controladora Interna da Câmara"],
    [satelite, pm, "SATELITE", "Secretário Municipal de Saúde"],
  ] as const) {
    await prisma.vinculoCliente.upsert({
      where: { usuarioId_clienteId: { usuarioId: u.id, clienteId: c.id } },
      create: { usuarioId: u.id, clienteId: c.id, perfil, cargo },
      update: { perfil, cargo },
    });
  }

  const gab = await unidade(pm.id, "Gabinete do Prefeito", "GAB");
  const sesau = await unidade(pm.id, "Secretaria Municipal de Saúde", "SESAU", satelite.nome);
  await unidade(pm.id, "Secretaria Municipal de Educação", "SEDUC");
  await unidade(pm.id, "Secretaria Municipal de Administração", "SEAD");
  await unidade(pm.id, "Secretaria Municipal da Fazenda", "SEFAZ");
  await unidade(cm.id, "Mesa Diretora", "MESA");
  await unidade(cm.id, "Diretoria Administrativa e Financeira", "DAF");

  const regulacao = await prisma.unidade.findFirst({ where: { clienteId: pm.id, sigla: "REG" } })
    ?? await prisma.unidade.create({
      data: { clienteId: pm.id, paiId: sesau.id, nome: "Central de Regulação", sigla: "REG", tipo: "SETOR" },
    });

  const vinculoSat = await prisma.vinculoCliente.findUniqueOrThrow({
    where: { usuarioId_clienteId: { usuarioId: satelite.id, clienteId: pm.id } },
  });
  await prisma.escopoSatelite.upsert({
    where: { vinculoId_unidadeId: { vinculoId: vinculoSat.id, unidadeId: sesau.id } },
    create: { clienteId: pm.id, vinculoId: vinculoSat.id, unidadeId: sesau.id },
    update: {},
  });

  const ano = new Date().getFullYear();
  const demandaExiste = await prisma.demanda.findFirst({ where: { clienteId: pm.id, ano, numero: 1 } });
  if (!demandaExiste) {
    const prazo = new Date();
    prazo.setDate(prazo.getDate() + 10);
    const d = await prisma.demanda.create({
      data: {
        clienteId: pm.id,
        numero: 1,
        ano,
        assunto: "Lista de espera da regulação",
        descricao:
          "Encaminhar a lista de espera atualizada da Central de Regulação, por especialidade, com data de " +
          "inclusão de cada paciente e critério de priorização adotado.",
        unidadeDestinoId: sesau.id,
        prazo,
        prioridade: "ALTA",
        criadoPorId: controlador.id,
      },
    });
    await prisma.tramitacaoDemanda.create({
      data: {
        clienteId: pm.id,
        demandaId: d.id,
        tipo: "ENVIO",
        statusNovo: "ENVIADA",
        texto: d.descricao,
        usuarioId: controlador.id,
        usuarioNome: controlador.nome,
      },
    });
    await prisma.demanda.create({
      data: {
        clienteId: pm.id,
        numero: 2,
        ano,
        assunto: "Relação de contratos vigentes da Administração",
        descricao: "Encaminhar planilha com todos os contratos vigentes e respectivos fiscais designados.",
        unidadeDestinoId: gab.id,
        prazo,
        criadoPorId: controlador.id,
      },
    });
  }

  console.log(`
Seed concluído. Senha de todos os usuários de demonstração: ${SENHA_DEMO}
  ${admin.email}  (Administrador HorizonAJ)
  ${controlador.email}  (Controladora: Prefeitura e Câmara)
  ${satelite.email}  (Satélite: Secretaria de Saúde e ${regulacao.nome})`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
