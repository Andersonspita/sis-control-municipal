import type { FaixaLimite, Poder } from "./tipos";

type TipoEntidade = "PREFEITURA" | "CAMARA" | "AUTARQUIA" | "FUNDACAO" | "CONSORCIO" | "EMPRESA_PUBLICA" | "OUTRO";

/**
 * Limites da despesa total com pessoal sobre a RCL ajustada (LRF, arts. 19, 20, 22 e 59):
 * máximo; prudencial = 95% do máximo; alerta = 90% do máximo.
 */
export const LIMITES_PESSOAL: Record<Poder, { alerta: number; prudencial: number; maximo: number }> = {
  E: { alerta: 48.6, prudencial: 51.3, maximo: 54 },
  L: { alerta: 5.4, prudencial: 5.7, maximo: 6 },
};

/** Limite da dívida consolidada líquida dos municípios: 120% da RCL (Res. Senado 40/2001); alerta em 90%. */
export const LIMITE_DCL = { alerta: 108, maximo: 120 };

export const PODER: Record<Poder, string> = { E: "Poder Executivo", L: "Poder Legislativo" };

/** A Câmara responde pelo Legislativo; as demais entidades usam os dados do Executivo do município. */
export function poderDaEntidade(tipo: TipoEntidade): Poder {
  return tipo === "CAMARA" ? "L" : "E";
}

export function faixaPessoal(percentual: number, poder: Poder): FaixaLimite {
  const l = LIMITES_PESSOAL[poder];
  if (percentual > l.maximo) return "EXCEDIDO";
  if (percentual > l.prudencial) return "PRUDENCIAL";
  if (percentual >= l.alerta) return "ALERTA";
  return "REGULAR";
}

export function faixaDcl(percentual: number): FaixaLimite {
  if (percentual > LIMITE_DCL.maximo) return "EXCEDIDO";
  if (percentual >= LIMITE_DCL.alerta) return "ALERTA";
  return "REGULAR";
}

export const ROTULO_FAIXA: Record<FaixaLimite, string> = {
  REGULAR: "Abaixo do limite de alerta",
  ALERTA: "Limite de alerta atingido",
  PRUDENCIAL: "Acima do limite prudencial",
  EXCEDIDO: "Acima do limite máximo",
};
