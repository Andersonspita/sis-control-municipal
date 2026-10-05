// Dados de demonstração da autoavaliação e do plano de ação (idempotente).
// Prefeitura: ciclo do ano anterior concluído (para a comparação) e ciclo do ano atual parcialmente respondido,
// com plano de ação gerado a partir das lacunas.

import type { PrismaClient, SituacaoRequisito } from "../src/generated/prisma/client";
import { gerarPlanoDoCiclo } from "../src/lib/dados/gerar-plano";

type Pessoa = { id: string; nome: string };
type Resposta = [SituacaoRequisito, string?, string?];

const ANTERIOR: Record<string, Resposta> = {
  "I.1": ["ATENDIDO", "Lei Municipal nº 1.234/2013 cria a Controladoria-Geral do Município."],
  "I.2": ["NAO_ATENDIDO", "Controladoria funciona com apenas um servidor e sem organograma próprio."],
  "I.3": ["NAO_ATENDIDO", "Não há dotação orçamentária própria na LOA."],
  "I.4": ["NAO_ATENDIDO", "A lei atribui apenas a função de controle interno."],
  "I.5": ["ATENDIDO", "Subordinação direta ao Prefeito (art. 3º da Lei 1.234/2013)."],
  "II.1": ["PARCIALMENTE_ATENDIDO", "Dois de três servidores são efetivos; um é comissionado."],
  "II.2": ["NAO_ATENDIDO", "Não houve concurso específico para a área de controle."],
  "II.3": ["NAO_ATENDIDO", "Não existe carreira de controle interno."],
  "III.1": ["ATENDIDO", "Cargo de Controlador-Geral criado pela Lei 1.234/2013."],
  "III.2": ["ATENDIDO", "Titular graduada em Ciências Contábeis."],
  "III.3": ["ATENDIDO", "Doze anos de serviço na Secretaria da Fazenda."],
  "III.4": ["PARCIALMENTE_ATENDIDO", "Apresentadas certidões estaduais; faltam as federais."],
  "III.5": ["ATENDIDO", "Titular é servidora efetiva."],
  "IV.1": ["NAO_ATENDIDO", "Equipe insuficiente para as atribuições."],
  "IV.2": ["PARCIALMENTE_ATENDIDO", "Sala compartilhada com a Procuradoria."],
  "IV.3": ["NAO_ATENDIDO", "Sem acesso de consulta aos sistemas de folha e patrimônio."],
  "V.1": ["NAO_ATENDIDO", "Não há auditoria interna estruturada."],
  "V.2": ["PARCIALMENTE_ATENDIDO", "Controle interno atua só na análise de processos de pagamento."],
  "V.3": ["NAO_ATENDIDO", "Corregedoria vinculada à Secretaria de Administração."],
  "V.4": ["NAO_ATENDIDO", "Ouvidoria vinculada ao Gabinete."],
  VI: ["ATENDIDO", "Nenhum servidor da controladoria acumula funções de contabilidade, tesouraria ou compras."],
  "VII.1": ["NAO_ATENDIDO", "Não há plano de capacitação."],
  "VII.2": ["NAO_ATENDIDO", "Sem parcerias formais."],
  VIII: ["ATENDIDO", "Não há contratos de consultoria executando atividades de controle interno."],
};

const ATUAL: Record<string, Resposta> = {
  "I.1": ["ATENDIDO", "Lei Municipal nº 1.234/2013, alterada pela Lei nº 1.502/2025.", "Lei 1.234/2013 e Lei 1.502/2025 (Diário Oficial de 12/03/2025)."],
  "I.2": ["PARCIALMENTE_ATENDIDO", "Organograma aprovado, mas o quadro de cargos ainda não foi totalmente provido.", "Decreto nº 310/2025 (organograma)."],
  "I.3": ["NAO_ATENDIDO", "A controladoria continua sem unidade orçamentária própria na LOA."],
  "I.4": ["PARCIALMENTE_ATENDIDO", "A Lei 1.502/2025 incluiu auditoria interna; corregedoria e ouvidoria seguem em outras secretarias."],
  "I.5": ["ATENDIDO", "Subordinação direta ao Prefeito mantida.", "Art. 3º da Lei 1.234/2013."],
  "II.1": ["ATENDIDO", "Todos os servidores lotados são efetivos.", "Relação nominal de servidores (RH, jan/2026)."],
  "II.2": ["PARCIALMENTE_ATENDIDO", "Concurso de 2025 exigiu nível superior, mas sem conteúdo específico de controle."],
  "II.3": ["NAO_ATENDIDO", "Projeto de lei da carreira ainda não foi enviado à Câmara."],
  "III.1": ["ATENDIDO", "Cargo criado pela Lei 1.234/2013."],
  "III.2": ["ATENDIDO", "Titular graduada em Ciências Contábeis.", "Diploma arquivado no RH."],
  "III.3": ["ATENDIDO", "Doze anos de serviço na Secretaria da Fazenda."],
  "III.4": ["ATENDIDO", "Certidões estaduais e federais apresentadas em 2026.", "Certidões negativas (TJBA, TRF1, Justiça Eleitoral)."],
  "III.5": ["NAO_APLICAVEL", "Titular é servidora efetiva; não houve nomeação sem vínculo a justificar."],
  "IV.1": ["PARCIALMENTE_ATENDIDO", "Equipe passou de 3 para 5 servidores, ainda abaixo do necessário."],
  "IV.3": ["NAO_ATENDIDO", "Acesso aos sistemas de folha e patrimônio ainda não foi liberado."],
  "V.1": ["PARCIALMENTE_ATENDIDO", "Auditoria interna criada em lei, com um servidor designado."],
  "V.3": ["NAO_ATENDIDO", "Corregedoria continua na Secretaria de Administração."],
  VI: ["ATENDIDO", "Mantida a segregação de funções."],
};

async function cicloComRespostas(
  prisma: PrismaClient,
  p: { clienteId: string; normaId: string; nome: string; dataInicio: Date; controlador: Pessoa; respostas: Record<string, Resposta> },
) {
  const existente = await prisma.cicloAvaliacao.findFirst({
    where: { clienteId: p.clienteId, normaId: p.normaId, nome: p.nome, unidadeId: null },
  });
  if (existente) return { ciclo: existente, novo: false };

  const requisitos = await prisma.requisito.findMany({
    where: { normaId: p.normaId, avaliavel: true, tiposEntidade: { has: "PREFEITURA" } },
    select: { id: true, codigo: true },
    orderBy: { ordem: "asc" },
  });
  const ciclo = await prisma.cicloAvaliacao.create({
    data: { clienteId: p.clienteId, normaId: p.normaId, nome: p.nome, dataInicio: p.dataInicio, criadoPorId: p.controlador.id },
  });
  await prisma.respostaRequisito.createMany({
    data: requisitos.map((r) => {
      const [situacao, observacao, evidencia] = p.respostas[r.codigo] ?? ["NAO_AVALIADO"];
      const avaliado = situacao !== "NAO_AVALIADO";
      return {
        clienteId: p.clienteId,
        cicloId: ciclo.id,
        requisitoId: r.id,
        situacao,
        observacao: observacao ?? null,
        evidencia: evidencia ?? null,
        respondidoPorId: avaliado ? p.controlador.id : null,
        respondidoEm: avaliado ? new Date() : null,
      };
    }),
  });
  return { ciclo, novo: true };
}

export async function autoavaliacaoDeExemplo(
  prisma: PrismaClient,
  p: { pm: string; controlador: Pessoa; sead: string; diasAPartirDeHoje: (dias: number) => Date },
) {
  const ot05 = await prisma.norma.findFirst({ where: { codigo: "OT05" }, orderBy: { versao: "desc" } });
  if (!ot05) return;
  const ano = new Date().getFullYear();

  const anterior = await cicloComRespostas(prisma, {
    clienteId: p.pm,
    normaId: ot05.id,
    nome: `Autoavaliação ${ano - 1}`,
    dataInicio: new Date(`${ano - 1}-02-01`),
    controlador: p.controlador,
    respostas: ANTERIOR,
  });
  if (anterior.ciclo.status === "EM_ANDAMENTO") {
    await prisma.cicloAvaliacao.update({
      where: { id: anterior.ciclo.id },
      data: {
        status: "CONCLUIDO",
        dataFim: new Date(`${ano - 1}-11-30`),
        concluidoEm: new Date(`${ano - 1}-11-30T18:00:00Z`),
        concluidoPorId: p.controlador.id,
      },
    });
  }

  const atual = await cicloComRespostas(prisma, {
    clienteId: p.pm,
    normaId: ot05.id,
    nome: `Autoavaliação ${ano}`,
    dataInicio: new Date(`${ano}-02-02`),
    controlador: p.controlador,
    respostas: ATUAL,
  });
  if (!atual.novo) return;

  const plano = await prisma.$transaction((tx) =>
    gerarPlanoDoCiclo(tx, { clienteId: p.pm, cicloId: atual.ciclo.id, usuarioId: p.controlador.id }),
  );
  if (!plano.planoId || !plano.planoNovo) return;

  // Algumas ações já em execução, uma vencida e uma aguardando validação, para a demonstração.
  const acoes = await prisma.acao.findMany({
    where: { planoId: plano.planoId },
    include: { respostaRequisito: { select: { requisito: { select: { codigo: true } } } } },
  });
  const porCodigo = new Map(acoes.map((a) => [a.respostaRequisito?.requisito.codigo, a]));
  const ajustes: Record<string, Parameters<typeof prisma.acao.update>[0]["data"]> = {
    "I.3": {
      responsavel: "Secretário Municipal da Fazenda",
      unidadeResponsavelId: null,
      onde: "Secretaria Municipal da Fazenda",
      como: "Criar unidade orçamentária da Controladoria no PLOA do próximo exercício.",
      prazo: p.diasAPartirDeHoje(-5),
      status: "EM_ANDAMENTO",
      percentual: 30,
    },
    "I.4": {
      responsavel: "Procuradoria-Geral do Município",
      como: "Minutar projeto de lei transferindo corregedoria e ouvidoria para a Controladoria.",
      prazo: p.diasAPartirDeHoje(45),
      status: "EM_ANDAMENTO",
      percentual: 50,
      custoEstimado: 0,
    },
    "IV.1": {
      responsavel: "Secretaria de Administração",
      unidadeResponsavelId: p.sead,
      como: "Lotar mais dois servidores efetivos com formação em contabilidade ou direito.",
      prazo: p.diasAPartirDeHoje(20),
      status: "AGUARDANDO_VALIDACAO",
      percentual: 100,
    },
    "IV.3": {
      responsavel: "Departamento de Tecnologia",
      como: "Liberar perfis de consulta nos sistemas de folha, patrimônio e compras.",
      prazo: p.diasAPartirDeHoje(15),
      custoEstimado: 4800,
      prioridade: "URGENTE",
    },
  };
  for (const [codigo, data] of Object.entries(ajustes)) {
    const acao = porCodigo.get(codigo);
    if (acao) await prisma.acao.update({ where: { id: acao.id }, data });
  }
  const acaoI4 = porCodigo.get("I.4");
  if (acaoI4) {
    await prisma.marcoAcao.createMany({
      data: [
        { clienteId: p.pm, acaoId: acaoI4.id, descricao: "Minuta do projeto de lei", prazo: p.diasAPartirDeHoje(-10), concluidoEm: new Date(), ordem: 0 },
        { clienteId: p.pm, acaoId: acaoI4.id, descricao: "Envio à Câmara Municipal", prazo: p.diasAPartirDeHoje(30), ordem: 1 },
      ],
    });
  }
}
