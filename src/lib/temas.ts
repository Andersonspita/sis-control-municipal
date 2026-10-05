/** Como o menu principal é apresentado em cada tema. */
export type Navegacao =
  | "lateral" // menu lateral com grupos
  | "topo" // barra superior com grupos + faixa com os itens do grupo ativo
  | "trilho" // trilho de ícones dos grupos + painel com os itens do grupo ativo
  | "faixas"; // barra superior + faixa com todos os grupos visíveis

export type Tema = {
  id: string;
  numero: number;
  nome: string;
  resumo: string;
  fontes: string;
  navegacao: Navegacao;
};

// A lista de ids precisa coincidir com a restrição clientes_tema_check do banco
// e com os blocos [data-tema] de src/app/globals.css.
export const TEMAS = [
  {
    id: "institucional",
    numero: 1,
    nome: "Institucional",
    resumo: "Azul-marinho com detalhes em dourado. Formal, próximo da linguagem de tribunais e órgãos de controle.",
    fontes: "Public Sans",
    navegacao: "lateral",
  },
  {
    id: "petroleo",
    numero: 2,
    nome: "Verde-petróleo",
    resumo: "Claro e arejado, menu lateral branco e cantos arredondados. Leve para uso prolongado.",
    fontes: "IBM Plex Sans",
    navegacao: "lateral",
  },
  {
    id: "grafite",
    numero: 3,
    nome: "Grafite e âmbar",
    resumo: "Grafite com destaque âmbar e títulos em serifa. Sóbrio, lembra relatórios de auditoria.",
    fontes: "Source Sans e Source Serif",
    navegacao: "lateral",
  },
  {
    id: "ameixa",
    numero: 4,
    nome: "Ameixa e ciano",
    resumo: "Ameixa profundo com ciano e tipografia de alta legibilidade. Navegação no topo em dois níveis.",
    fontes: "Atkinson Hyperlegible",
    navegacao: "topo",
  },
  {
    id: "mata",
    numero: 5,
    nome: "Mata e Cobre",
    resumo: "Verde-mata sobre papel quente, com cobre como sinal de foco. Trilho de ícones com painel do grupo.",
    fontes: "Libre Franklin, Literata e JetBrains Mono",
    navegacao: "trilho",
  },
  {
    id: "bordo",
    numero: 6,
    nome: "Bordô e Anil",
    resumo: "Bordô de capa de processo e anil como cor de foco. Menu superior em duas faixas, com todos os grupos visíveis.",
    fontes: "Red Hat Display, Text e Mono",
    navegacao: "faixas",
  },
] as const satisfies readonly Tema[];

export type IdTema = (typeof TEMAS)[number]["id"];

export const TEMA_PADRAO: IdTema = "mata";

export const IDS_TEMAS = TEMAS.map((t) => t.id) as [IdTema, ...IdTema[]];

export function temaValido(valor: unknown): valor is IdTema {
  return typeof valor === "string" && (IDS_TEMAS as string[]).includes(valor);
}

export function obterTema(id: string | null | undefined): (typeof TEMAS)[number] {
  return TEMAS.find((t) => t.id === id) ?? TEMAS.find((t) => t.id === TEMA_PADRAO)!;
}
