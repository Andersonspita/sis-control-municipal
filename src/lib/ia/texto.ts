// Extração de texto dos documentos e divisão em trechos com página e posição.

export type TextoExtraido =
  | { ok: true; paginas: string[]; paginado: boolean }
  | { ok: false; motivo: string };

/** Abaixo disso por página, o PDF é tratado como escaneado (imagem sem camada de texto). */
const MINIMO_CARACTERES_POR_PAGINA = 20;

export function normalizarTexto(texto: string) {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/[\u00a0\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function extrairTexto(conteudo: Buffer, mimeType: string, nome: string): Promise<TextoExtraido> {
  const ext = nome.slice(nome.lastIndexOf(".") + 1).toLowerCase();

  if (mimeType === "application/pdf" || ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(conteudo));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const paginas = text.map(normalizarTexto);
    const caracteres = paginas.reduce((s, p) => s + p.length, 0);
    if (caracteres < MINIMO_CARACTERES_POR_PAGINA * Math.max(1, totalPages)) {
      return { ok: false, motivo: "PDF sem texto extraível (provavelmente digitalizado como imagem)." };
    }
    return { ok: true, paginas, paginado: true };
  }

  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: conteudo });
    const texto = normalizarTexto(value);
    return texto ? { ok: true, paginas: [texto], paginado: false } : { ok: false, motivo: "Documento sem texto." };
  }

  if (ext === "txt" || ext === "csv" || mimeType.startsWith("text/")) {
    const bruto = conteudo.toString("utf8").replace(/^\uFEFF/, "");
    // Quebra de página (form feed) vira paginação, como em textos exportados de PDF.
    const partes = bruto.split("\f");
    const paginas = partes.map(normalizarTexto);
    if (!paginas.some(Boolean)) return { ok: false, motivo: "Arquivo de texto vazio." };
    return { ok: true, paginas, paginado: partes.length > 1 };
  }

  return { ok: false, motivo: "Formato sem extração de texto (imagens e planilhas ainda não são lidas pela IA)." };
}

export type Trecho = { ordem: number; pagina: number | null; posicao: number; texto: string };

/**
 * Divide cada página em trechos de até `tamanho` caracteres, com sobreposição, cortando de preferência
 * em fim de parágrafo, frase ou palavra. A posição é o deslocamento do trecho dentro da página.
 */
export function dividirEmTrechos(
  paginas: string[],
  { paginado = true, tamanho = 1200, sobreposicao = 150 }: { paginado?: boolean; tamanho?: number; sobreposicao?: number } = {},
): Trecho[] {
  const trechos: Trecho[] = [];
  paginas.forEach((pagina, i) => {
    let inicio = 0;
    while (inicio < pagina.length) {
      let fim = Math.min(inicio + tamanho, pagina.length);
      if (fim < pagina.length) {
        const janela = pagina.slice(inicio + Math.floor(tamanho / 2), fim);
        const corte = ["\n\n", ". ", "\n", "; ", " "].map((s) => janela.lastIndexOf(s)).find((p) => p >= 0);
        if (corte !== undefined) fim = inicio + Math.floor(tamanho / 2) + corte + 1;
      }
      const bruto = pagina.slice(inicio, fim);
      const texto = bruto.trim();
      if (texto) {
        trechos.push({ ordem: trechos.length, pagina: paginado ? i + 1 : null, posicao: inicio + (bruto.length - bruto.trimStart().length), texto });
      }
      if (fim >= pagina.length) break;
      let proximo = Math.max(fim - sobreposicao, inicio + 1);
      const espaco = pagina.indexOf(" ", proximo);
      if (espaco >= 0 && espaco < fim) proximo = espaco + 1;
      inicio = proximo;
    }
  });
  return trechos;
}
