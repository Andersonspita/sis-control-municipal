import type {
  Perfil,
  Prioridade,
  SituacaoRequisito,
  StatusAcao,
  StatusDemanda,
  TipoCliente,
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
