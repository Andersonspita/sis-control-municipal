import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prioridade, type StatusDemanda, type TipoTramite } from "../src/generated/prisma/client";
import { importarCatalogo } from "../src/lib/catalogos/importar";
import { salvarArquivo } from "../src/lib/armazenamento";
import { autoavaliacaoDeExemplo } from "./seed-autoavaliacao";

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

type Pessoa = { id: string; nome: string };

function diasAPartirDeHoje(dias: number) {
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  return new Date(Date.parse(hoje) + dias * 86_400_000);
}

function horasAtras(horas: number) {
  return new Date(Date.now() - horas * 3_600_000);
}

async function anexo(
  clienteId: string,
  enviadoPor: Pessoa,
  nome: string,
  conteudo: string,
  vinculo: { demandaId?: string; tramiteId?: string },
) {
  const salvo = await salvarArquivo(clienteId, nome, Buffer.from(conteudo, "utf8"));
  return prisma.documento.create({ data: { ...salvo, ...vinculo, clienteId, enviadoPorId: enviadoPor.id } });
}

type Tramite = {
  tipo: TipoTramite;
  por: Pessoa;
  horas: number;
  de?: StatusDemanda;
  para?: StatusDemanda;
  texto?: string;
  novoPrazo?: Date;
  interno?: boolean;
  anexo?: { nome: string; conteudo: string };
};

async function demandaComHistorico(
  clienteId: string,
  dados: { assunto: string; descricao: string; unidadeDestinoId: string; prazo: Date; prioridade: Prioridade; status: StatusDemanda },
  criadoPor: Pessoa,
  tramites: Tramite[],
) {
  if (await prisma.demanda.findFirst({ where: { clienteId, assunto: dados.assunto } })) return;
  const ano = new Date().getFullYear();
  const ultima = await prisma.demanda.aggregate({ where: { clienteId, ano }, _max: { numero: true } });
  const demanda = await prisma.demanda.create({
    data: { ...dados, clienteId, ano, numero: (ultima._max.numero ?? 0) + 1, criadoPorId: criadoPor.id, criadoEm: horasAtras(tramites[0].horas) },
  });
  for (const t of tramites) {
    const tramite = await prisma.tramitacaoDemanda.create({
      data: {
        clienteId,
        demandaId: demanda.id,
        tipo: t.tipo,
        statusAnterior: t.de,
        statusNovo: t.para,
        texto: t.texto,
        novoPrazo: t.novoPrazo,
        interno: t.interno ?? false,
        usuarioId: t.por.id,
        usuarioNome: t.por.nome,
        criadoEm: horasAtras(t.horas),
      },
    });
    if (t.anexo) await anexo(clienteId, t.por, t.anexo.nome, t.anexo.conteudo, { demandaId: demanda.id, tramiteId: tramite.id });
  }
}

async function demandasDeExemplo(p: {
  pm: string;
  controlador: Pessoa;
  satelite: Pessoa;
  gab: string;
  sesau: string;
  regulacao: string;
  seduc: string;
}) {
  const { pm, controlador, satelite } = p;

  // Demanda 2 do seed original foi criada sem o trâmite de envio.
  const contratos = await prisma.demanda.findFirst({ where: { clienteId: pm, unidadeDestinoId: p.gab, numero: 2 } });
  if (contratos && !(await prisma.tramitacaoDemanda.count({ where: { demandaId: contratos.id } }))) {
    await prisma.tramitacaoDemanda.create({
      data: { clienteId: pm, demandaId: contratos.id, tipo: "ENVIO", statusNovo: "ENVIADA", usuarioId: controlador.id, usuarioNome: controlador.nome },
    });
  }

  await demandaComHistorico(
    pm,
    {
      assunto: "Escala de plantões da Central de Regulação",
      descricao: "Encaminhar a escala de plantões médicos e de reguladores do mês corrente, com carga horária de cada profissional.",
      unidadeDestinoId: p.regulacao,
      prazo: diasAPartirDeHoje(6),
      prioridade: "MEDIA",
      status: "RESPONDIDA",
    },
    controlador,
    [
      { tipo: "ENVIO", por: controlador, horas: 72, para: "ENVIADA" },
      { tipo: "VISUALIZACAO", por: satelite, horas: 50, de: "ENVIADA", para: "VISUALIZADA" },
      {
        tipo: "RESPOSTA",
        por: satelite,
        horas: 26,
        de: "VISUALIZADA",
        para: "RESPONDIDA",
        texto: "Segue a escala de plantões do mês, conforme solicitado.",
        anexo: { nome: "escala-plantoes.csv", conteudo: "profissional;funcao;carga_horaria\nDra. Ana;reguladora;40\nDr. Bruno;regulador;20\n" },
      },
      {
        tipo: "COMENTARIO",
        por: controlador,
        horas: 2,
        interno: true,
        texto: "Conferir se a carga horária bate com a folha de pagamento antes de concluir.",
        anexo: { nome: "nota-interna-conferencia.txt", conteudo: "Nota interna da controladoria: cruzar escala com folha de pagamento." },
      },
    ],
  );

  await demandaComHistorico(
    pm,
    {
      assunto: "Contratos de manutenção das ambulâncias",
      descricao: "Enviar cópia dos contratos de manutenção preventiva e corretiva das ambulâncias e os relatórios de execução dos últimos 6 meses.",
      unidadeDestinoId: p.sesau,
      prazo: diasAPartirDeHoje(-3),
      prioridade: "URGENTE",
      status: "VISUALIZADA",
    },
    controlador,
    [
      { tipo: "ENVIO", por: controlador, horas: 24 * 12, para: "ENVIADA" },
      { tipo: "VISUALIZACAO", por: satelite, horas: 24 * 10, de: "ENVIADA", para: "VISUALIZADA" },
      {
        tipo: "PRORROGACAO_SOLICITADA",
        por: satelite,
        horas: 24 * 4,
        novoPrazo: diasAPartirDeHoje(10),
        texto: "Os relatórios de execução estão com a empresa contratada; precisamos de mais 10 dias para reunir a documentação.",
      },
    ],
  );

  await demandaComHistorico(
    pm,
    {
      assunto: "Relatório de frequência dos professores",
      descricao: "Encaminhar o relatório consolidado de frequência dos professores da rede municipal no último bimestre.",
      unidadeDestinoId: p.seduc,
      prazo: diasAPartirDeHoje(12),
      prioridade: "BAIXA",
      status: "ENVIADA",
    },
    controlador,
    [
      {
        tipo: "ENVIO",
        por: controlador,
        horas: 5,
        para: "ENVIADA",
        anexo: { nome: "modelo-relatorio-frequencia.txt", conteudo: "Modelo: escola; professor; dias letivos; faltas; justificativas." },
      },
    ],
  );

  if (!(await prisma.documento.findFirst({ where: { clienteId: pm, nome: "regimento-interno-controladoria.txt" } }))) {
    await anexo(pm, controlador, "regimento-interno-controladoria.txt", "Regimento interno da Controladoria-Geral do Município (exemplo).", {});
  }
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

  const seduc = await prisma.unidade.findFirstOrThrow({ where: { clienteId: pm.id, sigla: "SEDUC" } });
  await demandasDeExemplo({ pm: pm.id, controlador, satelite, gab: gab.id, sesau: sesau.id, regulacao: regulacao.id, seduc: seduc.id });

  const sead = await prisma.unidade.findFirstOrThrow({ where: { clienteId: pm.id, sigla: "SEAD" } });
  await autoavaliacaoDeExemplo(prisma, { pm: pm.id, controlador, sead: sead.id, diasAPartirDeHoje });

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
