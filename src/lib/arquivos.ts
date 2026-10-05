// Regras de upload compartilhadas entre o navegador (validação prévia) e o servidor (validação definitiva).

export const LIMITE_ARQUIVO_BYTES = 25 * 1024 * 1024;
export const LIMITE_ARQUIVOS_POR_ENVIO = 10;
export const LIMITE_TOTAL_ENVIO_BYTES = 100 * 1024 * 1024;

export type CategoriaArquivo = "pdf" | "imagem" | "texto" | "planilha" | "documento";

type TipoPermitido = { mime: string; categoria: CategoriaArquivo };

/** Extensão → tipo gravado. O tipo informado pelo navegador é ignorado (pode ser falso ou vazio). */
export const TIPOS_PERMITIDOS: Record<string, TipoPermitido> = {
  pdf: { mime: "application/pdf", categoria: "pdf" },
  png: { mime: "image/png", categoria: "imagem" },
  jpg: { mime: "image/jpeg", categoria: "imagem" },
  jpeg: { mime: "image/jpeg", categoria: "imagem" },
  gif: { mime: "image/gif", categoria: "imagem" },
  webp: { mime: "image/webp", categoria: "imagem" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", categoria: "documento" },
  odt: { mime: "application/vnd.oasis.opendocument.text", categoria: "documento" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", categoria: "planilha" },
  ods: { mime: "application/vnd.oasis.opendocument.spreadsheet", categoria: "planilha" },
  csv: { mime: "text/csv", categoria: "planilha" },
  txt: { mime: "text/plain", categoria: "texto" },
};

export const ACCEPT_ARQUIVOS = Object.keys(TIPOS_PERMITIDOS)
  .map((ext) => `.${ext}`)
  .join(",");

export const DESCRICAO_TIPOS = "PDF, imagens (PNG, JPG, GIF, WebP), DOCX, ODT, XLSX, ODS, CSV e TXT";

export function extensao(nome: string) {
  const i = nome.lastIndexOf(".");
  return i < 0 ? "" : nome.slice(i + 1).toLowerCase();
}

export function tipoDoArquivo(nome: string): TipoPermitido | null {
  return TIPOS_PERMITIDOS[extensao(nome)] ?? null;
}

export function categoriaPorMime(mime: string): CategoriaArquivo {
  return Object.values(TIPOS_PERMITIDOS).find((t) => t.mime === mime)?.categoria ?? "documento";
}

export function formatarTamanho(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB`;
  return `${(kb / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
}

/** Validação de nome, tipo e tamanho. Retorna a mensagem de erro ou null. */
export function validarArquivo(nome: string, tamanho: number): string | null {
  if (!tipoDoArquivo(nome)) return `"${nome}": tipo de arquivo não permitido. Envie ${DESCRICAO_TIPOS}.`;
  if (tamanho === 0) return `"${nome}": o arquivo está vazio.`;
  if (tamanho > LIMITE_ARQUIVO_BYTES) {
    return `"${nome}": excede o limite de ${formatarTamanho(LIMITE_ARQUIVO_BYTES)} por arquivo.`;
  }
  if (nome.length > 200) return "O nome do arquivo deve ter no máximo 200 caracteres.";
  return null;
}

export function validarConjunto(arquivos: { name: string; size: number }[]): string | null {
  if (arquivos.length > LIMITE_ARQUIVOS_POR_ENVIO) return `Envie no máximo ${LIMITE_ARQUIVOS_POR_ENVIO} arquivos por vez.`;
  for (const a of arquivos) {
    const erro = validarArquivo(a.name, a.size);
    if (erro) return erro;
  }
  const total = arquivos.reduce((s, a) => s + a.size, 0);
  if (total > LIMITE_TOTAL_ENVIO_BYTES) {
    return `O total dos anexos excede ${formatarTamanho(LIMITE_TOTAL_ENVIO_BYTES)} por envio.`;
  }
  return null;
}
