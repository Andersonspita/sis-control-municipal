import { SignJWT, jwtVerify } from "jose";

export const COOKIE_SESSAO = "cm_sessao";
export const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000;

function chave() {
  const segredo = process.env.SESSION_SECRET;
  if (!segredo || segredo.length < 32) throw new Error("SESSION_SECRET ausente ou curto demais");
  return new TextEncoder().encode(segredo);
}

export async function assinarToken(sid: string, expiraEm: Date) {
  return new SignJWT({ sid })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiraEm)
    .sign(chave());
}

/** Validação apenas criptográfica; a validade real da sessão é conferida no banco pela DAL. */
export async function lerToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, chave(), { algorithms: ["HS256"] });
    return typeof payload.sid === "string" ? payload.sid : null;
  } catch {
    return null;
  }
}
