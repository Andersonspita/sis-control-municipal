import type {
  Macrofuncao,
  OrigemPlano,
  Perfil,
  Prioridade,
  SituacaoRequisito,
  StatusAcao,
  StatusCiclo,
  StatusDemanda,
  StatusPlano,
  TipoCliente,
  TipoRequisito,
  TipoTramite,
  TipoUnidade,
} from "@/generated/prisma/browser";

export const TIPO_CLIENTE: Record<TipoCliente, string> = {
  PREFEITURA: "Prefeitura",
  CAMARA: "Câmara Municipal",
  AUTARQUIA: "Autarquia",
  FUNDACAO: "Fundação",
  CONSORCIO: "Consórcio",
  EMPRESA_PUBLICA: "Empresa pública",
  OUTRO: "Outro",
};

export const PERFIL: Record<Perfil, string> = {
  CONTROLADOR: "Controlador",
  EQUIPE: "Equipe de controle",
  SATELITE: "Acesso restrito",
};

export const TIPO_UNIDADE: Record<TipoUnidade, string> = {
  ORGAO: "Órgão",
  SECRETARIA: "Secretaria",
  DEPARTAMENTO: "Departamento",
  DIVISAO: "Divisão",
  SETOR: "Setor",
  OUTRO: "Outro",
};

export const STATUS_DEMANDA: Record<StatusDemanda, string> = {
  ENVIADA: "Enviada",
  VISUALIZADA: "Visualizada",
  RESPONDIDA: "Respondida",
  EM_ANALISE: "Em análise",
  DEVOLVIDA: "Devolvida",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

export const TIPO_TRAMITE: Record<TipoTramite, string> = {
  ENVIO: "Demanda enviada",
  VISUALIZACAO: "Demanda visualizada pela unidade",
  RESPOSTA: "Resposta enviada",
  ANALISE: "Resposta em análise",
  DEVOLUCAO: "Devolvida para complementação",
  CONCLUSAO: "Resposta aceita e demanda concluída",
  CANCELAMENTO: "Demanda cancelada",
  PRORROGACAO_SOLICITADA: "Prorrogação de prazo solicitada",
  PRORROGACAO_DEFERIDA: "Prorrogação deferida",
  PRORROGACAO_INDEFERIDA: "Prorrogação indeferida",
  COMENTARIO: "Comentário",
};

export const PRIORIDADE: Record<Prioridade, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Urgente",
};

export const SITUACAO_REQUISITO: Record<SituacaoRequisito, string> = {
  NAO_AVALIADO: "Não avaliado",
  ATENDIDO: "Atendido",
  PARCIALMENTE_ATENDIDO: "Parcialmente atendido",
  NAO_ATENDIDO: "Não atendido",
  NAO_APLICAVEL: "Não se aplica",
};

export const STATUS_ACAO: Record<StatusAcao, string> = {
  PENDENTE: "Pendente",
  EM_ANDAMENTO: "Em andamento",
  AGUARDANDO_VALIDACAO: "Aguardando validação",
  CONCLUIDA: "Concluída",
  CANCELADA: "Cancelada",
};

/** Rótulos curtos usados na marcação da resposta. */
export const RESPOSTA_REQUISITO: Record<Exclude<SituacaoRequisito, "NAO_AVALIADO">, string> = {
  ATENDIDO: "Atende",
  PARCIALMENTE_ATENDIDO: "Atende parcialmente",
  NAO_ATENDIDO: "Não atende",
  NAO_APLICAVEL: "Não se aplica",
};

export const STATUS_CICLO: Record<StatusCiclo, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDO: "Concluído",
  ARQUIVADO: "Arquivado",
};

export const ORIGEM_PLANO: Record<OrigemPlano, string> = {
  REQUISITO: "Autoavaliação",
  AUDITORIA: "Auditoria",
  MEDIDA: "Medida",
  DETERMINACAO_TC: "Determinação do TC",
  OUTRA: "Outra",
};

export const STATUS_PLANO: Record<StatusPlano, string> = {
  RASCUNHO: "Rascunho",
  EM_EXECUCAO: "Em execução",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

export const TIPO_REQUISITO: Record<TipoRequisito, string> = {
  ESTRUTURAL: "Estrutural",
  PROCEDIMENTAL: "Procedimental",
  DOCUMENTAL: "Documental",
};

/** Na ordem de exibição: macrofunções da OT 05/2024 e, depois, as áreas controladas. */
export const MACROFUNCAO: Record<Macrofuncao, string> = {
  CONTROLADORIA: "Controladoria",
  AUDITORIA_INTERNA: "Auditoria interna",
  CORREGEDORIA: "Corregedoria",
  OUVIDORIA: "Ouvidoria",
  PLANEJAMENTO_ORCAMENTO: "Planejamento e orçamento",
  CONTABILIDADE_FINANCAS: "Contabilidade e finanças",
  GESTAO_FISCAL: "Gestão fiscal (LRF)",
  RECEITA: "Receita e dívida ativa",
  PESSOAL: "Pessoal",
  PATRIMONIO: "Patrimônio, almoxarifado e frota",
  LICITACOES_CONTRATOS: "Licitações e contratos",
  OBRAS: "Obras públicas",
  TRANSFERENCIAS: "Subvenções e transferências",
  TRANSPARENCIA: "Transparência e prestação de contas",
};
