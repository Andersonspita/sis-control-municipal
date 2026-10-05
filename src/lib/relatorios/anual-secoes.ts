// Seções de texto do Relatório Anual de Controle Interno (art. 17 da Res. TCM-BA 1.120/2005),
// editadas pelo controlador antes da emissão. Compartilhado entre servidor e formulário.

export const SECOES_ANUAL = [
  {
    chave: "apresentacao",
    titulo: "Apresentação",
    ajuda: "Finalidade do relatório, exercício de referência e base legal.",
  },
  {
    chave: "estrutura",
    titulo: "Estrutura e funcionamento do controle interno",
    ajuda: "Composição da unidade de controle, normas internas, recursos e limitações no exercício.",
  },
  {
    chave: "metas",
    titulo: "Cumprimento das metas do PPA, da LDO e execução do orçamento",
    ajuda: "Avaliação das metas e programas de governo e da execução orçamentária.",
  },
  {
    chave: "gestao",
    titulo: "Gestão orçamentária, financeira, patrimonial e limites legais",
    ajuda: "Legalidade, eficácia e eficiência da gestão; limites de pessoal, saúde, educação, dívida e operações de crédito.",
  },
  {
    chave: "recomendacoes",
    titulo: "Recomendações e providências adotadas",
    ajuda: "Recomendações emitidas ao gestor e medidas adotadas para corrigir as falhas apontadas.",
  },
  {
    chave: "conclusao",
    titulo: "Conclusão",
    ajuda: "Parecer conclusivo da controladoria sobre o exercício.",
  },
] as const;

export type ChaveSecaoAnual = (typeof SECOES_ANUAL)[number]["chave"];
export type SecoesAnual = Partial<Record<ChaveSecaoAnual, string>>;

export const LIMITE_SECAO_ANUAL = 20_000;

/** Lê o JSON gravado, ignorando chaves desconhecidas e valores não textuais. */
export function lerSecoesAnual(valor: unknown): SecoesAnual {
  const saida: SecoesAnual = {};
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return saida;
  for (const { chave } of SECOES_ANUAL) {
    const v = (valor as Record<string, unknown>)[chave];
    if (typeof v === "string") saida[chave] = v;
  }
  return saida;
}

export function anoValido(ano: number) {
  return Number.isInteger(ano) && ano >= 2000 && ano <= 2100;
}
