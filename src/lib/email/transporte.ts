import nodemailer, { type Transporter } from "nodemailer";

// Sem "server-only": também é usado pelos scripts de linha de comando (lembretes de prazo).

export type Mensagem = { para: string; assunto: string; html: string; texto: string };

let transporte: Transporter | undefined;

function obterTransporte() {
  if (!transporte) {
    const usuario = process.env.SMTP_USER;
    transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "localhost",
      port: Number(process.env.SMTP_PORT || 1025),
      secure: process.env.SMTP_SECURE === "true",
      ...(usuario && { auth: { user: usuario, pass: process.env.SMTP_PASS ?? "" } }),
    });
  }
  return transporte;
}

/** Endereço público da aplicação, sem barra final, para montar links nos e-mails. */
export function urlApp(caminho: string) {
  return `${(process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "")}${caminho}`;
}

/**
 * Envia cada mensagem individualmente (um destinatário por e-mail, sem expor os demais endereços).
 * Nunca lança: falhas são registradas no console e contadas no retorno.
 */
export async function enviarEmails(mensagens: Mensagem[]) {
  const remetente = process.env.EMAIL_REMETENTE || "Controladoria <nao-responda@localhost>";
  const resultados = await Promise.allSettled(
    mensagens.map((m) => obterTransporte().sendMail({ from: remetente, to: m.para, subject: m.assunto, html: m.html, text: m.texto })),
  );
  let falhas = 0;
  resultados.forEach((r, i) => {
    if (r.status === "rejected") {
      falhas++;
      console.error(`[e-mail] Falha ao enviar "${mensagens[i].assunto}" para ${mensagens[i].para}:`, r.reason);
    }
  });
  return { enviados: mensagens.length - falhas, falhas };
}
