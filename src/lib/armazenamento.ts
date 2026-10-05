// Armazenamento de arquivos: S3 compatível (Silo/MinIO) ou disco local.
// Sem "server-only" porque também é usado por prisma/seed.ts; depende de node:fs, então não roda no navegador.
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { tipoDoArquivo, validarArquivo } from "@/lib/arquivos";
import { ErroArquivo } from "@/lib/erros";

export type ArquivoArmazenado = {
  nome: string;
  mimeType: string;
  tamanho: number;
  sha256: string;
  storageKey: string;
};

type Driver = "s3" | "local";

function configS3() {
  const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY || !S3_SECRET_KEY) return null;
  return {
    endpoint: S3_ENDPOINT,
    region: S3_REGION || "us-east-1",
    bucket: S3_BUCKET,
    accessKeyId: S3_ACCESS_KEY,
    secretAccessKey: S3_SECRET_KEY,
  };
}

/** STORAGE_DRIVER="s3" ou "local" força o driver; vazio usa S3 quando as variáveis S3_* estão completas. */
export function driverArmazenamento(): Driver {
  const pedido = process.env.STORAGE_DRIVER?.trim().toLowerCase();
  if (pedido === "s3") {
    if (!configS3()) throw new Error("STORAGE_DRIVER=s3, mas S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY ou S3_SECRET_KEY não foram definidas");
    return "s3";
  }
  if (pedido === "local") return "local";
  return configS3() ? "s3" : "local";
}

const globalArmazenamento = globalThis as unknown as { s3?: S3Client; bucketPronto?: Promise<void> };

function clienteS3() {
  const cfg = configS3()!;
  globalArmazenamento.s3 ??= new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return { s3: globalArmazenamento.s3, bucket: cfg.bucket };
}

async function garantirBucket() {
  const { s3, bucket } = clienteS3();
  globalArmazenamento.bucketPronto ??= (async () => {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status !== 404) throw err;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
  })().catch((err) => {
    globalArmazenamento.bucketPronto = undefined;
    throw err;
  });
  return globalArmazenamento.bucketPronto;
}

function diretorioLocal() {
  return path.resolve(process.env.STORAGE_LOCAL_DIR || "storage");
}

function caminhoLocal(storageKey: string) {
  const base = diretorioLocal();
  const destino = path.resolve(base, storageKey);
  if (!destino.startsWith(base + path.sep)) throw new Error("Chave de armazenamento inválida");
  return destino;
}

// Assinaturas mínimas para recusar arquivos cujo conteúdo não corresponde à extensão.
function conteudoConfere(ext: string, b: Buffer) {
  const comeca = (...bytes: number[]) => bytes.every((v, i) => b[i] === v);
  switch (ext) {
    case "pdf":
      return b.subarray(0, 1024).includes("%PDF-");
    case "png":
      return comeca(0x89, 0x50, 0x4e, 0x47);
    case "jpg":
    case "jpeg":
      return comeca(0xff, 0xd8, 0xff);
    case "gif":
      return b.subarray(0, 4).toString("latin1") === "GIF8";
    case "webp":
      return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
    case "docx":
    case "xlsx":
    case "odt":
    case "ods":
      return comeca(0x50, 0x4b, 0x03, 0x04);
    case "csv":
    case "txt":
      return !b.subarray(0, 8192).includes(0);
    default:
      return false;
  }
}

function nomeSeguro(nome: string) {
  return nome.replace(/[\u0000-\u001f\u007f\\/]/g, "_").trim().slice(0, 200) || "arquivo";
}

/** Valida e grava o conteúdo. Não toca no banco: o chamador registra o Documento (e chama `removerArquivo` se falhar). */
export async function salvarArquivo(clienteId: string, nomeOriginal: string, conteudo: Buffer): Promise<ArquivoArmazenado> {
  const nome = nomeSeguro(nomeOriginal);
  const erro = validarArquivo(nome, conteudo.length);
  if (erro) throw new ErroArquivo(erro);
  const tipo = tipoDoArquivo(nome)!;
  const ext = nome.slice(nome.lastIndexOf(".") + 1).toLowerCase();
  if (!conteudoConfere(ext, conteudo)) throw new ErroArquivo(`"${nome}": o conteúdo não corresponde ao tipo do arquivo.`);

  const storageKey = `${clienteId}/${new Date().getUTCFullYear()}/${randomUUID()}`;
  const sha256 = createHash("sha256").update(conteudo).digest("hex");

  if (driverArmazenamento() === "s3") {
    await garantirBucket();
    const { s3, bucket } = clienteS3();
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: conteudo,
        ContentType: tipo.mime,
        ContentLength: conteudo.length,
        Metadata: { sha256 },
      }),
    );
  } else {
    const destino = caminhoLocal(storageKey);
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(destino, conteudo, { flag: "wx" });
  }

  return { nome, mimeType: tipo.mime, tamanho: conteudo.length, sha256, storageKey };
}

async function lerLocal(storageKey: string) {
  const origem = caminhoLocal(storageKey);
  await fs.access(origem);
  return Readable.toWeb(createReadStream(origem)) as ReadableStream<Uint8Array>;
}

export async function lerArquivo(storageKey: string): Promise<ReadableStream<Uint8Array>> {
  if (driverArmazenamento() === "local") return lerLocal(storageKey);
  const { s3, bucket } = clienteS3();
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: storageKey }));
    if (!r.Body) throw new Error("Objeto sem conteúdo");
    return r.Body.transformToWebStream() as ReadableStream<Uint8Array>;
  } catch (err) {
    // Arquivos gravados antes da troca do driver local para S3 continuam no disco.
    if ((err as { name?: string }).name !== "NoSuchKey") throw err;
    return lerLocal(storageKey);
  }
}

export async function removerArquivo(storageKey: string) {
  try {
    if (driverArmazenamento() === "s3") {
      const { s3, bucket } = clienteS3();
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: storageKey }));
    } else {
      await fs.rm(caminhoLocal(storageKey), { force: true });
    }
  } catch (err) {
    console.error("Falha ao remover arquivo órfão", storageKey, err);
  }
}