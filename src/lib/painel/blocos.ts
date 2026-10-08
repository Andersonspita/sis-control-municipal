// Blocos que podem aparecer no painel inicial. O usuário escolhe quais exibe (preferência gravada
// em usuarios.preferencias.painel.ocultos); os demais continuam acessíveis nas páginas de origem.
// Compartilhado entre servidor e o diálogo "Personalizar painel".

export type BlocoPainel = {
  id: string;
  titulo: string;
  descricao: string;
  /** Página com a visão completa do assunto. */
  pagina: { href: string; rotulo: string };
};

export const BLOCOS_PAINEL = [
  {
    id: "indices",
    titulo: "Índices em destaque",
    descricao: "Despesa com pessoal, dívida consolidada, RCL, resultado primário, entregas ao SICONFI e aderência às normas.",
    pagina: { href: "/dados-externos", rotulo: "Dados externos" },
  },
  {
    id: "alertas-fiscais",
    titulo: "Alertas fiscais (LRF)",
    descricao: "Limites de pessoal (folha), dívida consolidada e entregas ao SICONFI que exigem atenção.",
    pagina: { href: "/alertas", rotulo: "Alertas" },
  },
  {
    id: "alertas",
    titulo: "Alertas registrados",
    descricao: "Situações em aberto por gravidade e ações vencidas nos planos.",
    pagina: { href: "/alertas", rotulo: "Alertas" },
  },
  {
    id: "demandas",
    titulo: "Demandas",
    descricao: "Em aberto, vencidas, respostas a analisar e ações em execução.",
    pagina: { href: "/demandas", rotulo: "Demandas" },
  },
  {
    id: "aderencia",
    titulo: "Aderência às normas",
    descricao: "Resultado do ciclo de autoavaliação mais recente de cada norma.",
    pagina: { href: "/autoavaliacao", rotulo: "Autoavaliação" },
  },
  {
    id: "movimentacoes",
    titulo: "Movimentações recentes",
    descricao: "Últimos trâmites das demandas.",
    pagina: { href: "/demandas", rotulo: "Demandas" },
  },
  {
    id: "planos",
    titulo: "Planos de ação",
    descricao: "Situação das ações 5W2H de todos os planos.",
    pagina: { href: "/planos", rotulo: "Planos de ação" },
  },
  {
    id: "transferencias",
    titulo: "Transferências federais",
    descricao: "Recursos federais recebidos no ano e convênios vigentes.",
    pagina: { href: "/dados-externos", rotulo: "Dados externos" },
  },
  {
    id: "unidades",
    titulo: "Unidades",
    descricao: "Secretarias e setores que recebem demandas e respondem por ações.",
    pagina: { href: "/unidades", rotulo: "Unidades" },
  },
] as const satisfies readonly BlocoPainel[];

export type IdBlocoPainel = (typeof BLOCOS_PAINEL)[number]["id"];

/** Blocos exibidos, na ordem do catálogo. Ids desconhecidos (de versões antigas) são ignorados. */
export function blocosVisiveis(ocultos: readonly string[]): IdBlocoPainel[] {
  return BLOCOS_PAINEL.map((b) => b.id).filter((id) => !ocultos.includes(id));
}
