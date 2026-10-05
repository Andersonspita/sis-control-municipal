import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Sparkles } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, db } from "@/lib/db";
import { obterEstadoIA } from "@/lib/ia/analises";
import { listarAnalises } from "@/lib/ia/dados";
import { MARCADORES, type TipoDadoPessoal } from "@/lib/ia/mascaramento";
import { formatarTamanho } from "@/lib/arquivos";
import { formatarDataHora } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { AvisoIA } from "@/components/ia/aviso-ia";
import { CompararComNorma } from "@/components/ia/comparar-com-norma";
import { ListaAnalises } from "@/components/ia/lista-analises";
import { BotaoAvaliarEvidencia } from "./botao-avaliar-evidencia";

export const metadata: Metadata = { title: "Documento" };

const EXTRACAO: Record<string, string> = {
  PENDENTE: "Ainda não processado",
  PROCESSANDO: "Processando",
  CONCLUIDA: "Texto extraído",
  SEM_TEXTO: "Sem texto extraível",
  ERRO: "Erro na extração",
};

export default async function DetalheDocumento({ params }: PageProps<"/documentos/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const dados = await comCliente(ctx, async (tx) => {
    const doc = await tx.documento.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        mimeType: true,
        tamanho: true,
        sha256: true,
        criadoEm: true,
        enviadoPorId: true,
        extracao: { select: { status: true, paginas: true, caracteres: true, mascaramentos: true, erro: true, processadoEm: true } },
        _count: { select: { trechos: true } },
        respostaRequisito: {
          select: { id: true, requisito: { select: { codigo: true, titulo: true } }, ciclo: { select: { id: true, nome: true, status: true } } },
        },
      },
    });
    if (!doc) return null;
    const ciclos = await tx.cicloAvaliacao.findMany({
      where: { status: "EM_ANDAMENTO" },
      orderBy: { criadoEm: "desc" },
      select: { id: true, nome: true, norma: { select: { codigo: true } } },
    });
    return { doc, ciclos };
  });
  if (!dados) notFound();
  const { doc, ciclos } = dados;
  const [estado, analises, enviadoPor] = await Promise.all([
    obterEstadoIA(),
    listarAnalises(ctx, { documentoId: doc.id }, 10),
    db.usuario.findUnique({ where: { id: doc.enviadoPorId }, select: { nome: true } }),
  ]);
  const mascaramentos = Object.entries(doc.extracao?.mascaramentos ?? {}) as [TipoDadoPessoal, number][];
  const resposta = doc.respostaRequisito;

  return (
    <>
      <Link href="/documentos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Documentos
      </Link>
      <CabecalhoPagina
        titulo={doc.nome}
        descricao={`Enviado por ${enviadoPor?.nome ?? "—"} em ${formatarDataHora(doc.criadoEm)} · ${formatarTamanho(doc.tamanho)}`}
        acoes={
          <a href={`/arquivos/${doc.id}`} download={doc.nome} className={buttonVariants({ variant: "outline" })}>
            <Download aria-hidden="true" /> Baixar
          </a>
        }
      />
      <AvisoIA motivo={estado.motivo} admin={ctx.usuario.adminHorizon} className="mb-6" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles aria-hidden="true" className="size-4 text-primary" /> Comparar com a norma
              </CardTitle>
              <CardDescription>
                A IA lê o documento e sugere a resposta de cada requisito do ciclo escolhido, citando o trecho e a página. As
                sugestões ficam pendentes até você aceitar, editar ou rejeitar.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CompararComNorma
                ciclos={ciclos.map((c) => ({ id: c.id, nome: `${c.nome} · ${c.norma.codigo}` }))}
                documentos={[{ id: doc.id, nome: doc.nome }]}
                disponivel={estado.disponivel}
              />
            </CardContent>
          </Card>

          {resposta && (
            <Card>
              <CardHeader>
                <CardTitle>Avaliar como evidência</CardTitle>
                <CardDescription>
                  Anexado ao requisito <span className="font-mono text-xs font-semibold">{resposta.requisito.codigo}</span> —{" "}
                  {resposta.requisito.titulo} ({resposta.ciclo.nome}). A IA diz se os anexos comprovam o requisito e o que falta.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {resposta.ciclo.status === "EM_ANDAMENTO" ? (
                  <BotaoAvaliarEvidencia respostaId={resposta.id} disponivel={estado.disponivel} />
                ) : (
                  <p className="text-sm text-muted-foreground">Ciclo encerrado: a evidência não pode mais ser reavaliada.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Texto para a IA</CardTitle>
              <CardDescription>{EXTRACAO[doc.extracao?.status ?? "PENDENTE"]}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {doc.extracao?.status === "CONCLUIDA" && (
                <p>
                  {doc.extracao.paginas} página(s) · {doc._count.trechos} trecho(s) indexados
                </p>
              )}
              {doc.extracao?.erro && <p className="text-muted-foreground">{doc.extracao.erro}</p>}
              {mascaramentos.length > 0 && (
                <p className="text-muted-foreground">
                  Dados pessoais mascarados antes do envio:{" "}
                  {mascaramentos.map(([tipo, n]) => `${MARCADORES[tipo] ?? tipo} × ${n}`).join(", ")}
                </p>
              )}
              {!doc.extracao && <p className="text-muted-foreground">O texto é extraído na primeira análise.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Análises deste documento</CardTitle>
              <CardDescription>
                <Link href="/ia" className="text-primary underline-offset-4 hover:underline">
                  Ver sugestões pendentes
                </Link>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ListaAnalises analises={analises} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
