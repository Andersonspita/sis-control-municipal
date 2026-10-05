/**
 * Classificação de risco por probabilidade (1 a 5) × impacto (1 a 5):
 * 15 ou mais é crítico, de 10 a 14 é alto, de 6 a 9 é médio e abaixo de 6 é baixo.
 * Vale para riscos e para a gravidade das Medidas.
 */

export type NivelRisco = "CRITICO" | "ALTO" | "MEDIO" | "BAIXO";

/** Do mais grave para o menos grave. */
export const NIVEIS_RISCO: readonly NivelRisco[] = ["CRITICO", "ALTO", "MEDIO", "BAIXO"];

export const NIVEL_RISCO: Record<NivelRisco, string> = {
  CRITICO: "Crítico",
  ALTO: "Alto",
  MEDIO: "Médio",
  BAIXO: "Baixo",
};

export const ESCALA = [1, 2, 3, 4, 5] as const;

export const PROBABILIDADE: Record<number, string> = {
  1: "Rara",
  2: "Improvável",
  3: "Possível",
  4: "Provável",
  5: "Quase certa",
};

export const IMPACTO: Record<number, string> = {
  1: "Insignificante",
  2: "Menor",
  3: "Moderado",
  4: "Maior",
  5: "Catastrófico",
};

export function valorDeEscalaValido(v: number) {
  return Number.isInteger(v) && v >= 1 && v <= 5;
}

export function pontuacaoRisco(probabilidade: number, impacto: number) {
  if (!valorDeEscalaValido(probabilidade) || !valorDeEscalaValido(impacto)) {
    throw new RangeError("Probabilidade e impacto devem ser inteiros de 1 a 5.");
  }
  return probabilidade * impacto;
}

export function nivelPorPontuacao(pontuacao: number): NivelRisco {
  if (pontuacao >= 15) return "CRITICO";
  if (pontuacao >= 10) return "ALTO";
  if (pontuacao >= 6) return "MEDIO";
  return "BAIXO";
}

export function classificarRisco(probabilidade: number, impacto: number): NivelRisco {
  return nivelPorPontuacao(pontuacaoRisco(probabilidade, impacto));
}

/** Combinações de probabilidade e impacto que resultam no nível (útil para filtrar no banco). */
export function combinacoesDoNivel(nivel: NivelRisco): { probabilidade: number; impacto: number }[] {
  return ESCALA.flatMap((probabilidade) =>
    ESCALA.filter((impacto) => classificarRisco(probabilidade, impacto) === nivel).map((impacto) => ({ probabilidade, impacto })),
  );
}
