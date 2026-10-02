import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Parâmetros OWASP para Argon2id.
const opcoes = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function gerarHashSenha(senha: string) {
  return hash(senha, opcoes);
}

export async function conferirSenha(hashArmazenado: string, senha: string) {
  try {
    return await verify(hashArmazenado, senha);
  } catch {
    return false;
  }
}

let hashFicticio: Promise<string> | undefined;

/** Verificação contra um hash descartável, para o tempo de resposta não revelar se o e-mail existe. */
export async function conferirSenhaFicticia(senha: string) {
  hashFicticio ??= hash(crypto.randomUUID(), opcoes);
  await conferirSenha(await hashFicticio, senha);
  return false;
}
