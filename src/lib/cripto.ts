import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { ErroNegocio } from "@/lib/erros";

// Formato do texto cifrado: "v1:<iv>:<tag>:<dados>", partes em base64. O IV (12 bytes) é aleatório
// a cada cifragem e a tag de autenticação do GCM impede que um valor adulterado seja aceito.
const VERSAO = "v1";
const ALGORITMO = "aes-256-gcm";

/** Chave mestra de 32 bytes lida de CHAVE_CRIPTOGRAFIA (base64), ou null se ausente/inválida. */
function chaveMestra(): Buffer | null {
  const valor = process.env.CHAVE_CRIPTOGRAFIA?.trim();
  if (!valor || !/^[A-Za-z0-9+/_-]+={0,2}$/.test(valor)) return null;
  const chave = Buffer.from(valor, "base64");
  return chave.length === 32 ? chave : null;
}

export function criptografiaDisponivel() {
  return chaveMestra() !== null;
}

function exigirChaveMestra() {
  const chave = chaveMestra();
  if (!chave) {
    throw new ErroNegocio(
      "A variável CHAVE_CRIPTOGRAFIA não está definida ou não tem 32 bytes em base64. Configure-a no servidor.",
    );
  }
  return chave;
}

/** Cifra `texto` com AES-256-GCM. `contexto` (opcional) vincula o valor ao seu uso: decifrar exige o mesmo. */
export function cifrar(texto: string, contexto = ""): string {
  const iv = randomBytes(12);
  const cifra = createCipheriv(ALGORITMO, exigirChaveMestra(), iv);
  cifra.setAAD(Buffer.from(contexto, "utf8"));
  const dados = Buffer.concat([cifra.update(texto, "utf8"), cifra.final()]);
  return [VERSAO, iv.toString("base64"), cifra.getAuthTag().toString("base64"), dados.toString("base64")].join(":");
}

export function decifrar(cifrado: string, contexto = ""): string {
  const chave = exigirChaveMestra();
  const [versao, iv, tag, dados] = cifrado.split(":");
  if (versao !== VERSAO || !iv || !tag || dados === undefined) throw new ErroNegocio("Valor cifrado em formato desconhecido.");
  try {
    const decifra = createDecipheriv(ALGORITMO, chave, Buffer.from(iv, "base64"));
    decifra.setAAD(Buffer.from(contexto, "utf8"));
    decifra.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decifra.update(Buffer.from(dados, "base64")), decifra.final()]).toString("utf8");
  } catch {
    throw new ErroNegocio("Não foi possível decifrar o valor gravado (a CHAVE_CRIPTOGRAFIA pode ter sido trocada).");
  }
}
