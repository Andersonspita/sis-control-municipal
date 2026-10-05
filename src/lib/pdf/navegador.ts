import "server-only";
import { chromium, type Browser } from "playwright-core";

// Uma instância do Chromium por processo, reaproveitada entre requisições (cada PDF abre um contexto
// isolado e o fecha ao final). Em produção (Docker Linux) o Chromium precisa estar instalado na imagem:
// `npx playwright install --with-deps chromium` ou PDF_CHROMIUM_PATH apontando para um executável.

const ARGS = ["--disable-dev-shm-usage", "--font-render-hinting=none", "--disable-gpu"];
const MAX_SIMULTANEOS = 3;
const TEMPO_LIMITE_MS = 45_000;

const global = globalThis as unknown as { navegadorPdf?: Promise<Browser> };

async function iniciar(): Promise<Browser> {
  const executablePath = process.env.PDF_CHROMIUM_PATH || undefined;
  try {
    return await chromium.launch({ headless: true, executablePath, args: ARGS });
  } catch (err) {
    if (executablePath) throw err;
    // Sem o Chromium do Playwright baixado (ambiente de desenvolvimento), tenta o navegador do sistema.
    for (const channel of ["msedge", "chrome"]) {
      try {
        return await chromium.launch({ headless: true, channel, args: ARGS });
      } catch {
        // próximo canal
      }
    }
    throw err;
  }
}

async function navegador(): Promise<Browser> {
  const atual = global.navegadorPdf;
  if (atual) {
    const b = await atual.catch(() => null);
    if (b?.isConnected()) return b;
  }
  const promessa = iniciar();
  global.navegadorPdf = promessa;
  try {
    const b = await promessa;
    b.on("disconnected", () => {
      if (global.navegadorPdf === promessa) global.navegadorPdf = undefined;
    });
    return b;
  } catch (err) {
    if (global.navegadorPdf === promessa) global.navegadorPdf = undefined;
    throw err;
  }
}

let ativos = 0;
const fila: (() => void)[] = [];

async function comVaga<T>(fn: () => Promise<T>): Promise<T> {
  if (ativos >= MAX_SIMULTANEOS) await new Promise<void>((ok) => fila.push(ok));
  ativos++;
  try {
    return await fn();
  } finally {
    ativos--;
    fila.shift()?.();
  }
}

export type OpcoesPdf = {
  /** Templates de cabeçalho e rodapé do Chromium (HTML autocontido; imagens só como data URI). */
  cabecalho: string;
  rodape: string;
  paisagem?: boolean;
};

/** Converte um documento HTML completo em PDF A4. Requisições de rede da página são bloqueadas. */
export async function gerarPdf(documento: string, opcoes: OpcoesPdf): Promise<Buffer> {
  return comVaga(async () => {
    const b = await navegador();
    const contexto = await b.newContext({ javaScriptEnabled: false, locale: "pt-BR", timezoneId: "America/Bahia" });
    try {
      await contexto.route(/^(https?|file|ftp):/i, (rota) => rota.abort());
      const pagina = await contexto.newPage();
      pagina.setDefaultTimeout(TEMPO_LIMITE_MS);
      await pagina.setContent(documento, { waitUntil: "load" });
      await pagina.emulateMedia({ media: "print" });
      return await pagina.pdf({
        format: "A4",
        landscape: opcoes.paisagem ?? false,
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: opcoes.cabecalho,
        footerTemplate: opcoes.rodape,
        margin: { top: "30mm", bottom: "18mm", left: "16mm", right: "16mm" },
      });
    } finally {
      await contexto.close();
    }
  });
}

/** Encerra o navegador (scripts e testes; o servidor mantém a instância viva). */
export async function fecharNavegador() {
  const atual = global.navegadorPdf;
  global.navegadorPdf = undefined;
  const b = await atual?.catch(() => null);
  await b?.close();
}
