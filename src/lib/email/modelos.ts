import { formatarDataSimples } from "@/lib/datas";
import { numeroDemanda } from "@/lib/demandas";

// Modelos de e-mail: HTML simples (sem imagens nem tabelas de layout, contraste alto, idioma declarado)
// acompanhado da versão em texto puro.

export type Conteudo = { assunto: string; html: string; texto: string };

export type DemandaEmail = {
  numero: number;
  ano: number;
  assunto: string;
  prazo: Date;
  unidade: string;
  link: string;
};

export type EventoDemanda =
  | "enviada"
  | "respondida"
  | "devolvida"
  | "prorrogacao_solicitada"
  | "prorrogacao_deferida"
  | "prorrogacao_indeferida"
  | "concluida";

function escapar(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

type Bloco = { titulo: string; cliente: string; introducao: string; itens?: [string, string][]; link: string; rotuloLink: string };

function html({ titulo, cliente, introducao, corpo }: { titulo: string; cliente: string; introducao: string; corpo: string }) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(titulo)}</title></head>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#18181b">
<main style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #d4d4d8;border-radius:8px;padding:24px">
<p style="margin:0 0 4px;font-size:14px;color:#3f3f46">${escapar(cliente)}</p>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapar(titulo)}</h1>
<p style="margin:0 0 16px">${escapar(introducao)}</p>
${corpo}
<p style="margin:24px 0 0;font-size:13px;color:#52525b">Mensagem automática do sistema de Controladoria; não responda a este e-mail.</p>
</main>
</body>
</html>`;
}

function botao(link: string, rotulo: string) {
  return `<p style="margin:24px 0 0"><a href="${escapar(link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:underline;padding:12px 20px;border-radius:6px;font-weight:bold">${escapar(rotulo)}</a></p>
<p style="margin:8px 0 0;font-size:13px;color:#52525b">Se o botão não funcionar, copie o endereço: ${escapar(link)}</p>`;
}

function montar(b: Bloco): Omit<Conteudo, "assunto"> {
  const itens = b.itens ?? [];
  const lista = itens.length
    ? `<dl style="margin:0;padding:16px;background:#f4f4f5;border-radius:6px">${itens
        .map(([r, v]) => `<dt style="font-weight:bold;font-size:14px">${escapar(r)}</dt><dd style="margin:0 0 8px">${escapar(v)}</dd>`)
        .join("")}</dl>`
    : "";
  return {
    html: html({ titulo: b.titulo, cliente: b.cliente, introducao: b.introducao, corpo: lista + botao(b.link, b.rotuloLink) }),
    texto: [
      b.cliente,
      "",
      b.titulo,
      "",
      b.introducao,
      "",
      ...itens.map(([r, v]) => `${r}: ${v}`),
      "",
      `${b.rotuloLink}: ${b.link}`,
      "",
      "Mensagem automática do sistema de Controladoria; não responda a este e-mail.",
    ].join("\n"),
  };
}

const EVENTOS: Record<EventoDemanda, { titulo: string; introducao: (d: DemandaEmail, extra?: string) => string; rotuloLink: string }> = {
  enviada: {
    titulo: "Nova demanda",
    introducao: (d) => `A controladoria enviou uma nova demanda para ${d.unidade}.`,
    rotuloLink: "Abrir a demanda",
  },
  respondida: {
    titulo: "Demanda respondida",
    introducao: (d) => `${d.unidade} respondeu à demanda. A resposta aguarda análise da controladoria.`,
    rotuloLink: "Analisar a resposta",
  },
  devolvida: {
    titulo: "Demanda devolvida para complementação",
    introducao: () => "A controladoria analisou a resposta e pediu complementação. Veja as orientações na tramitação da demanda.",
    rotuloLink: "Ver o que complementar",
  },
  prorrogacao_solicitada: {
    titulo: "Pedido de prorrogação de prazo",
    introducao: (d, extra) => `${d.unidade} pediu prorrogação do prazo${extra ? ` para ${extra}` : ""}. O pedido aguarda decisão.`,
    rotuloLink: "Decidir o pedido",
  },
  prorrogacao_deferida: {
    titulo: "Prorrogação de prazo deferida",
    introducao: () => "A controladoria deferiu o pedido de prorrogação. O prazo abaixo já está atualizado.",
    rotuloLink: "Abrir a demanda",
  },
  prorrogacao_indeferida: {
    titulo: "Prorrogação de prazo indeferida",
    introducao: () => "A controladoria indeferiu o pedido de prorrogação. O prazo original continua valendo.",
    rotuloLink: "Ver o motivo",
  },
  concluida: {
    titulo: "Demanda concluída",
    introducao: () => "A controladoria aceitou a resposta e concluiu a demanda. Nenhuma providência adicional é necessária.",
    rotuloLink: "Abrir a demanda",
  },
};

export function modeloEventoDemanda(evento: EventoDemanda, cliente: string, d: DemandaEmail, extra?: string): Conteudo {
  const e = EVENTOS[evento];
  const numero = numeroDemanda(d.numero, d.ano);
  return {
    assunto: `${e.titulo} ${numero}: ${d.assunto}`,
    ...montar({
      titulo: `${e.titulo} — ${numero}`,
      cliente,
      introducao: e.introducao(d, extra),
      itens: [
        ["Demanda", numero],
        ["Assunto", d.assunto],
        ["Unidade", d.unidade],
        ["Prazo", formatarDataSimples(d.prazo)],
      ],
      link: d.link,
      rotuloLink: e.rotuloLink,
    }),
  };
}

export type ItemResumo = DemandaEmail & { situacao: string };

/** Lista de demandas (lembrete de prazo ou resumo de vencidas). */
export function modeloResumo(opcoes: { assunto: string; titulo: string; cliente: string; introducao: string; itens: ItemResumo[]; link: string; rotuloLink: string }): Conteudo {
  const { itens } = opcoes;
  const linhaTexto = (i: ItemResumo) =>
    `- ${numeroDemanda(i.numero, i.ano)} — ${i.assunto}\n  Unidade: ${i.unidade} | Prazo: ${formatarDataSimples(i.prazo)} (${i.situacao})\n  ${i.link}`;
  const lista = `<ul style="margin:0;padding:0;list-style:none">${itens
    .map(
      (i) => `<li style="margin:0 0 12px;padding:12px 16px;background:#f4f4f5;border-radius:6px">
<a href="${escapar(i.link)}" style="color:#1d4ed8;font-weight:bold">${escapar(numeroDemanda(i.numero, i.ano))} — ${escapar(i.assunto)}</a><br>
<span style="font-size:14px">Unidade: ${escapar(i.unidade)} · Prazo: ${escapar(formatarDataSimples(i.prazo))} (<strong>${escapar(i.situacao)}</strong>)</span></li>`,
    )
    .join("")}</ul>`;
  return {
    assunto: opcoes.assunto,
    html: html({ titulo: opcoes.titulo, cliente: opcoes.cliente, introducao: opcoes.introducao, corpo: lista + botao(opcoes.link, opcoes.rotuloLink) }),
    texto: [
      opcoes.cliente,
      "",
      opcoes.titulo,
      "",
      opcoes.introducao,
      "",
      ...itens.map(linhaTexto),
      "",
      `${opcoes.rotuloLink}: ${opcoes.link}`,
      "",
      "Mensagem automática do sistema de Controladoria; não responda a este e-mail.",
    ].join("\n"),
  };
}
