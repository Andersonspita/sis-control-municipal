// Cálculo de conformidade da autoavaliação. Funções puras (sem banco), usadas no servidor e no navegador.
//
// Fórmula: Atende = 1, Parcial = 0,5, Não atende = 0, ponderados pelo peso do requisito (padrão 1).
// "Não se aplica" e "Não avaliado" ficam fora do denominador.

import type { SituacaoRequisito } from "@/generated/prisma/browser";

export const SITUACOES: SituacaoRequisito[] = [
  "NAO_AVALIADO",
  "ATENDIDO",
  "PARCIALMENTE_ATENDIDO",
  "NAO_ATENDIDO",
  "NAO_APLICAVEL",
];

/** Situações em que a justificativa é obrigatória. */
export const EXIGE_JUSTIFICATIVA: SituacaoRequisito[] = ["PARCIALMENTE_ATENDIDO", "NAO_ATENDIDO", "NAO_APLICAVEL"];

/** Situações que geram ação no plano. */
export const GERA_ACAO: SituacaoRequisito[] = ["PARCIALMENTE_ATENDIDO", "NAO_ATENDIDO"];

export type ItemConformidade = {
  situacao: SituacaoRequisito;
  peso?: number | null;
};

export type ResultadoConformidade = {
  /** Fração de 0 a 1, ou null quando nada entrou no denominador. */
  indice: number | null;
  pontos: number;
  maximo: number;
  total: number;
  avaliados: number;
  contagem: Record<SituacaoRequisito, number>;
};

/** Pontos de uma situação; null = fora do denominador. */
export function pontuacao(situacao: SituacaoRequisito): number | null {
  switch (situacao) {
    case "ATENDIDO":
      return 1;
    case "PARCIALMENTE_ATENDIDO":
      return 0.5;
    case "NAO_ATENDIDO":
      return 0;
    default:
      return null;
  }
}

function pesoValido(peso: number | null | undefined) {
  return typeof peso === "number" && Number.isFinite(peso) && peso >= 0 ? peso : 1;
}

export function contagemVazia(): Record<SituacaoRequisito, number> {
  return { NAO_AVALIADO: 0, ATENDIDO: 0, PARCIALMENTE_ATENDIDO: 0, NAO_ATENDIDO: 0, NAO_APLICAVEL: 0 };
}

export function calcularConformidade(itens: Iterable<ItemConformidade>): ResultadoConformidade {
  const contagem = contagemVazia();
  let pontos = 0;
  let maximo = 0;
  let total = 0;
  for (const item of itens) {
    total++;
    contagem[item.situacao]++;
    const p = pontuacao(item.situacao);
    if (p === null) continue;
    const peso = pesoValido(item.peso);
    pontos += p * peso;
    maximo += peso;
  }
  return {
    indice: maximo > 0 ? pontos / maximo : null,
    pontos,
    maximo,
    total,
    avaliados: total - contagem.NAO_AVALIADO,
    contagem,
  };
}

export type GrupoConformidade = ResultadoConformidade & { chave: string };

/** Agrupa e calcula por chave (capítulo, macrofunção…). Itens com chave null/undefined são ignorados. */
export function conformidadePorGrupo<T extends ItemConformidade>(
  itens: readonly T[],
  chaveDe: (item: T) => string | null | undefined,
): Map<string, GrupoConformidade> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const chave = chaveDe(item);
    if (chave == null) continue;
    const lista = grupos.get(chave);
    if (lista) lista.push(item);
    else grupos.set(chave, [item]);
  }
  const saida = new Map<string, GrupoConformidade>();
  for (const [chave, lista] of grupos) saida.set(chave, { chave, ...calcularConformidade(lista) });
  return saida;
}

/** Ancestral de nível superior (capítulo) de cada nó, dado o mapa id → paiId. */
export function mapaCapitulos(nos: readonly { id: string; paiId: string | null }[]): Map<string, string> {
  const pais = new Map(nos.map((n) => [n.id, n.paiId]));
  const memo = new Map<string, string>();
  const raizDe = (id: string): string => {
    const conhecido = memo.get(id);
    if (conhecido) return conhecido;
    const visitados = new Set<string>();
    let atual = id;
    while (true) {
      const pai = pais.get(atual);
      if (!pai || !pais.has(pai) || visitados.has(pai)) break;
      visitados.add(atual);
      atual = pai;
    }
    memo.set(id, atual);
    return atual;
  };
  for (const n of nos) raizDe(n.id);
  return memo;
}

/** Percentual de 0 a 100 com uma casa decimal, ou null. */
export function percentual(indice: number | null): number | null {
  return indice === null ? null : Math.round(indice * 1000) / 10;
}

export function formatarPercentual(indice: number | null): string {
  const p = percentual(indice);
  return p === null ? "—" : `${p.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

export type Evolucao = {
  chave: string;
  anterior: number | null;
  atual: number | null;
  /** Diferença em pontos percentuais; null quando algum lado não tem índice. */
  variacao: number | null;
};

/** Evolução por grupo entre dois ciclos (chaves estáveis entre ciclos, ex.: código do capítulo). */
export function compararGrupos(
  atual: ReadonlyMap<string, { indice: number | null }>,
  anterior: ReadonlyMap<string, { indice: number | null }>,
): Evolucao[] {
  const chaves = [...new Set([...atual.keys(), ...anterior.keys()])];
  return chaves.map((chave) => {
    const a = percentual(atual.get(chave)?.indice ?? null);
    const b = percentual(anterior.get(chave)?.indice ?? null);
    return {
      chave,
      atual: a,
      anterior: b,
      variacao: a !== null && b !== null ? Math.round((a - b) * 10) / 10 : null,
    };
  });
}

/** Validação da resposta: devolve a mensagem de erro ou null. */
export function validarResposta(situacao: SituacaoRequisito, justificativa: string | null | undefined): string | null {
  if (EXIGE_JUSTIFICATIVA.includes(situacao) && !justificativa?.trim()) {
    return "Justificativa obrigatória para Atende parcialmente, Não atende e Não se aplica.";
  }
  return null;
}
