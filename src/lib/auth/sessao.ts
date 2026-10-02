import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "@/lib/db";
import { COOKIE_SESSAO, DURACAO_SESSAO_MS, assinarToken, lerToken } from "./token";

export function hashSid(sid: string) {
  return createHash("sha256").update(sid).digest("hex");
}

export async function criarSessao(usuarioId: string, clienteAtivoId: string | null) {
  const sid = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + DURACAO_SESSAO_MS);
  const h = await headers();

  await db.sessao.create({
    data: {
      id: hashSid(sid),
      usuarioId,
      clienteAtivoId,
      expiraEm,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: h.get("user-agent")?.slice(0, 400) ?? null,
    },
  });

  const token = await assinarToken(sid, expiraEm);
  (await cookies()).set(COOKIE_SESSAO, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiraEm,
  });
}

/** Retorna o id (hash) da sessão do cookie atual, sem consultar o banco. */
export async function idSessaoDoCookie(): Promise<string | null> {
  const sid = await lerToken((await cookies()).get(COOKIE_SESSAO)?.value);
  return sid ? hashSid(sid) : null;
}

export async function encerrarSessao() {
  const id = await idSessaoDoCookie();
  if (id) await db.sessao.deleteMany({ where: { id } });
  (await cookies()).delete(COOKIE_SESSAO);
}

export async function definirClienteAtivo(clienteId: string) {
  const id = await idSessaoDoCookie();
  if (!id) return;
  await db.sessao.update({ where: { id }, data: { clienteAtivoId: clienteId } });
}
