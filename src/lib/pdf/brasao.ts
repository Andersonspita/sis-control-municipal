import "server-only";
import { lerArquivo } from "@/lib/armazenamento";

const LIMITE_BYTES = 2 * 1024 * 1024;

function tipoImagem(b: Buffer): string | null {
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const inicio = b.subarray(0, 512).toString("utf8").trimStart();
  if (inicio.startsWith("<svg") || (inicio.startsWith("<?xml") && inicio.includes("<svg"))) return "image/svg+xml";
  return null;
}

/** Brasão da entidade como data URI (o cabeçalho do Chromium não carrega URLs); null se ausente ou inválido. */
export async function brasaoComoDataUri(brasaoKey: string | null | undefined): Promise<string | null> {
  if (!brasaoKey) return null;
  try {
    const leitor = (await lerArquivo(brasaoKey)).getReader();
    const partes: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await leitor.read();
      if (done) break;
      total += value.byteLength;
      if (total > LIMITE_BYTES) {
        await leitor.cancel();
        return null;
      }
      partes.push(value);
    }
    const buffer = Buffer.concat(partes);
    const tipo = tipoImagem(buffer);
    return tipo ? `data:${tipo};base64,${buffer.toString("base64")}` : null;
  } catch (err) {
    console.error("Brasão indisponível para o relatório", brasaoKey, err);
    return null;
  }
}
