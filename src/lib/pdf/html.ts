// Montagem de HTML no servidor para os relatórios em PDF.
//
// Template string com escape automático em vez de react-dom/server: Route Handlers rodam na camada
// react-server, onde react-dom/server não está disponível. Valores interpolados são escapados, exceto
// instâncias de `Html` (trechos já montados por `html`) e arrays delas.

export class Html {
  constructor(readonly valor: string) {}
  toString() {
    return this.valor;
  }
}

type Valor = Html | string | number | boolean | null | undefined | readonly Valor[];

export function escapar(texto: string) {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function serializar(v: Valor): string {
  if (v === null || v === undefined || v === false || v === true) return "";
  if (v instanceof Html) return v.valor;
  if (Array.isArray(v)) return v.map(serializar).join("");
  return escapar(String(v));
}

export function html(partes: TemplateStringsArray, ...valores: Valor[]): Html {
  let saida = partes[0];
  for (let i = 0; i < valores.length; i++) saida += serializar(valores[i]) + partes[i + 1];
  return new Html(saida);
}

/** HTML confiável, sem escape (só para conteúdo gerado pelo próprio sistema). */
export function bruto(texto: string) {
  return new Html(texto);
}

/** Texto livre do usuário com quebras de linha preservadas (parágrafos e <br>). */
export function paragrafos(texto: string | null | undefined, vazio = "—"): Html {
  const limpo = texto?.trim();
  if (!limpo) return html`<p class="vazio">${vazio}</p>`;
  return bruto(
    limpo
      .split(/\n\s*\n/)
      .map((p) => `<p>${escapar(p.trim()).replace(/\n/g, "<br>")}</p>`)
      .join(""),
  );
}

/** Texto plano para conferência em testes (sem tags e com entidades básicas resolvidas). */
export function textoDoHtml(conteudo: string) {
  return conteudo
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
