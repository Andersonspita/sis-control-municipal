// Conferência das citações devolvidas pelo modelo: só vale trecho literal que existe no texto enviado.

export type CitacaoBruta = { trecho: string; texto: string };

/** Trecho enviado ao modelo; `ref` é o rótulo curto usado no prompt (T1, T2...). */
export type TrechoRef = {
  ref: string;
  id: string;
  documentoId: string;
  documentoNome: string;
  pagina: number | null;
  texto: string;
};

export type CitacaoConferida = {
  trechoId: string;
  documentoId: string;
  documentoNome: string;
  pagina: number | null;
  texto: string;
};

/** Menos que isso não identifica um trecho (evita "a lei" ou "art. 1º" como prova). */
export const MINIMO_CARACTERES_CITACAO = 12;

export function normalizarParaBusca(texto: string) {
  return texto
    .normalize("NFC")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/**
 * Mantém as citações cujo texto aparece literalmente (ignorando espaços, aspas tipográficas e caixa)
 * no trecho indicado ou, se o modelo errou o rótulo, em outro trecho enviado. As demais são descartadas.
 */
export function conferirCitacoes(brutas: CitacaoBruta[], trechos: TrechoRef[]) {
  const porRef = new Map(trechos.map((t) => [t.ref, t]));
  const normalizados = new Map(trechos.map((t) => [t.ref, normalizarParaBusca(t.texto)]));
  const validas: CitacaoConferida[] = [];
  const vistas = new Set<string>();
  let descartadas = 0;

  for (const c of brutas) {
    const alvo = normalizarParaBusca(c.texto.replace(/^["'“”]+|["'“”]+$/g, ""));
    if (alvo.length < MINIMO_CARACTERES_CITACAO) {
      descartadas++;
      continue;
    }
    const indicado = porRef.get(c.trecho.trim());
    const achado =
      indicado && normalizados.get(indicado.ref)!.includes(alvo)
        ? indicado
        : trechos.find((t) => normalizados.get(t.ref)!.includes(alvo));
    if (!achado) {
      descartadas++;
      continue;
    }
    const chave = `${achado.id}|${alvo}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    validas.push({
      trechoId: achado.id,
      documentoId: achado.documentoId,
      documentoNome: achado.documentoNome,
      pagina: achado.pagina,
      texto: c.texto.trim().replace(/\s+/g, " "),
    });
  }
  return { validas, descartadas };
}

export function localCitacao(c: Pick<CitacaoConferida, "documentoNome" | "pagina">) {
  return c.pagina ? `${c.documentoNome}, p. ${c.pagina}` : c.documentoNome;
}

/** Texto do campo "evidência" da resposta a partir das citações conferidas. */
export function evidenciaDasCitacoes(citacoes: CitacaoConferida[]) {
  return citacoes.map((c) => `${localCitacao(c)}: “${c.texto}”`).join("\n");
}
