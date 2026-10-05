// Acesso HTTP às APIs públicas. Sem "server-only": também é usado pelo script de sincronização (cron).

export type Buscador = typeof fetch;

/** Falha de uma API externa, com mensagem pronta para exibir ao usuário. */
export class ErroIntegracao extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
    this.name = "ErroIntegracao";
  }
}

type OpcoesBusca = {
  fonte: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
  tentativas?: number;
  buscador?: Buscador;
};

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** GET com timeout e nova tentativa em falha de rede, 429 ou 5xx. */
export async function buscarJson(url: string, opcoes: OpcoesBusca): Promise<unknown> {
  const { fonte, headers, timeoutMs = 25_000, tentativas = 2, buscador = fetch } = opcoes;
  let ultimoErro: ErroIntegracao | undefined;
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    if (tentativa > 1) await esperar(1500 * (tentativa - 1));
    let resposta: Response;
    try {
      resposta = await buscador(url, {
        headers: { Accept: "application/json", "User-Agent": "Controladoria-HorizonAJ/1.0", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
    } catch (err) {
      const tempo = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      ultimoErro = new ErroIntegracao(tempo ? `${fonte}: a API não respondeu a tempo.` : `${fonte}: falha de conexão com a API.`);
      continue;
    }
    if (resposta.ok) {
      try {
        return await resposta.json();
      } catch {
        throw new ErroIntegracao(`${fonte}: resposta da API em formato inesperado.`, resposta.status);
      }
    }
    const corpo = (await resposta.text().catch(() => "")).slice(0, 300);
    ultimoErro = new ErroIntegracao(mensagemHttp(fonte, resposta.status, corpo), resposta.status);
    if (resposta.status !== 429 && resposta.status < 500) break;
  }
  throw ultimoErro ?? new ErroIntegracao(`${fonte}: falha desconhecida.`);
}

function mensagemHttp(fonte: string, status: number, corpo: string) {
  if (status === 401 || status === 403) return `${fonte}: acesso recusado pela API (chave ausente ou inválida).`;
  if (status === 429) return `${fonte}: limite de requisições da API excedido; tente novamente em alguns minutos.`;
  if (status >= 500) return `${fonte}: a API está indisponível no momento (HTTP ${status}).`;
  return `${fonte}: a API recusou a consulta (HTTP ${status})${corpo ? `: ${corpo}` : ""}.`;
}

export function mensagemIntegracao(err: unknown) {
  if (err instanceof ErroIntegracao) return err.message;
  if (err instanceof Error && err.name === "ZodError") return "Resposta da API em formato inesperado.";
  return err instanceof Error ? err.message : "Falha desconhecida.";
}

export { esperar };
