// Texto-base do Relatório Anual de Controle Interno, usado quando a seção não foi personalizada
// no texto padrão do cliente nem no exercício. Ordem de prioridade de cada seção:
//   1. texto do exercício (relatorios_anuais)  2. texto padrão do cliente (modelos_relatorio_anual)  3. texto-base abaixo.
// Compartilhado entre servidor e formulários (sem dependências de servidor).

import { SECOES_ANUAL, type ChaveSecaoAnual, type SecoesAnual } from "./anual-secoes";

/** Variáveis aceitas nos textos; substituídas na emissão do PDF. */
export const VARIAVEIS_ANUAL = [
  { chave: "entidade", descricao: "nome da entidade" },
  { chave: "municipio", descricao: "município" },
  { chave: "uf", descricao: "UF" },
  { chave: "ano", descricao: "exercício do relatório" },
  { chave: "ano_seguinte", descricao: "exercício seguinte" },
] as const;

export type ValoresVariaveis = Record<(typeof VARIAVEIS_ANUAL)[number]["chave"], string>;

export const TEXTO_BASE_ANUAL: Record<ChaveSecaoAnual, string> = {
  apresentacao:
    "A Unidade de Controle Interno de {entidade} apresenta o Relatório Anual de Controle Interno referente ao exercício de {ano}, " +
    "em cumprimento ao art. 74 da Constituição Federal, ao art. 59 da Lei Complementar nº 101/2000 (Lei de Responsabilidade Fiscal) " +
    "e ao art. 17 da Resolução TCM-BA nº 1.120/2005.\n\n" +
    "O relatório consolida as atividades desenvolvidas no exercício — autoavaliação do sistema de controle interno, auditorias, " +
    "alertas, demandas encaminhadas às unidades e planos de ação — e apresenta a avaliação da controladoria sobre a gestão " +
    "orçamentária, financeira e patrimonial, com as recomendações e providências adotadas.",
  estrutura:
    "O sistema de controle interno de {entidade} é coordenado pela Unidade de Controle Interno, responsável por orientar, " +
    "acompanhar e avaliar os atos de gestão das unidades administrativas, nos termos da legislação municipal que o instituiu.\n\n" +
    "No exercício de {ano}, as atividades foram registradas no sistema de controladoria, que mantém a trilha das demandas, " +
    "das respostas das unidades, das evidências e das validações. Registram-se a seguir a composição da equipe, as normas " +
    "internas editadas e as eventuais limitações enfrentadas (recursos humanos, tecnológicos ou de acesso a informações).",
  metas:
    "A controladoria acompanhou a execução dos programas previstos no Plano Plurianual (PPA) e das metas e prioridades da " +
    "Lei de Diretrizes Orçamentárias (LDO) para {ano}, bem como a execução da Lei Orçamentária Anual (LOA).\n\n" +
    "Com base nos Relatórios Resumidos da Execução Orçamentária (RREO) e nos registros contábeis, avaliou-se o comportamento " +
    "da receita arrecadada em relação à prevista e da despesa executada em relação à autorizada, assim como o cumprimento " +
    "das metas fiscais de resultado primário e nominal.",
  gestao:
    "Avaliou-se a legalidade, a eficácia e a eficiência da gestão orçamentária, financeira e patrimonial de {entidade} " +
    "no exercício de {ano}, com atenção aos limites e condições estabelecidos pela LRF e pela legislação aplicável:\n\n" +
    "- despesa total com pessoal em relação à receita corrente líquida (arts. 19, 20 e 22 da LRF);\n" +
    "- dívida consolidada líquida e operações de crédito (Resolução do Senado Federal nº 40/2001 e nº 43/2001);\n" +
    "- aplicação mínima em manutenção e desenvolvimento do ensino (art. 212 da CF) e em ações e serviços públicos de saúde (LC nº 141/2012);\n" +
    "- envio tempestivo dos demonstrativos fiscais ao SICONFI e publicação dos relatórios de transparência.\n\n" +
    "Os alertas emitidos pela controladoria durante o exercício constam da seção de alertas deste relatório.",
  recomendacoes:
    "No exercício de {ano}, a controladoria emitiu recomendações às unidades e ao gestor a partir das auditorias, da " +
    "autoavaliação e dos alertas registrados. As providências adotadas e as pendentes estão detalhadas nos planos de ação " +
    "listados neste relatório, que seguirão em acompanhamento em {ano_seguinte}.",
  conclusao:
    "Diante do exposto, a Unidade de Controle Interno conclui que, no exercício de {ano}, a gestão de {entidade} observou, " +
    "de modo geral, as normas legais e regulamentares aplicáveis, ressalvados os pontos indicados neste relatório, cujas " +
    "providências continuarão a ser acompanhadas.\n\n" +
    "{municipio}/{uf}, data da assinatura.",
};

export type OrigemSecao = "ano" | "padrao" | "sistema";

/** Texto padrão do cliente para todas as seções (personalizado ou, na falta, o texto-base). */
export function textoPadraoCompleto(modelo: SecoesAnual): Record<ChaveSecaoAnual, string> {
  return Object.fromEntries(SECOES_ANUAL.map(({ chave }) => [chave, modelo[chave] || TEXTO_BASE_ANUAL[chave]])) as Record<
    ChaveSecaoAnual,
    string
  >;
}

/** Texto de cada seção para o exercício e de onde ele veio. */
export function secoesEfetivas(doAno: SecoesAnual, modelo: SecoesAnual) {
  return Object.fromEntries(
    SECOES_ANUAL.map(({ chave }) => {
      if (doAno[chave]) return [chave, { texto: doAno[chave]!, origem: "ano" as OrigemSecao }];
      if (modelo[chave]) return [chave, { texto: modelo[chave]!, origem: "padrao" as OrigemSecao }];
      return [chave, { texto: TEXTO_BASE_ANUAL[chave], origem: "sistema" as OrigemSecao }];
    }),
  ) as Record<ChaveSecaoAnual, { texto: string; origem: OrigemSecao }>;
}

const normalizar = (t: string) => t.replace(/\r\n/g, "\n").trim();

/**
 * Do que foi enviado no formulário do exercício, guarda só as seções que diferem do texto padrão:
 * as demais continuam acompanhando o padrão quando ele mudar.
 */
export function somentePersonalizadas(enviadas: SecoesAnual, modelo: SecoesAnual): SecoesAnual {
  const padrao = textoPadraoCompleto(modelo);
  const saida: SecoesAnual = {};
  for (const { chave } of SECOES_ANUAL) {
    const v = enviadas[chave];
    if (v && normalizar(v) !== normalizar(padrao[chave])) saida[chave] = v;
  }
  return saida;
}

/** O mesmo para o texto padrão do cliente: seções iguais ao texto-base não são gravadas. */
export function somenteDiferentesDoSistema(enviadas: SecoesAnual): SecoesAnual {
  const saida: SecoesAnual = {};
  for (const { chave } of SECOES_ANUAL) {
    const v = enviadas[chave];
    if (v && normalizar(v) !== normalizar(TEXTO_BASE_ANUAL[chave])) saida[chave] = v;
  }
  return saida;
}

/** Substitui {variavel} pelos valores; variáveis desconhecidas ficam como estão. */
export function aplicarVariaveis(texto: string, valores: ValoresVariaveis) {
  return texto.replace(/\{([a-z_]+)\}/g, (original, chave: string) =>
    chave in valores ? valores[chave as keyof ValoresVariaveis] : original,
  );
}
