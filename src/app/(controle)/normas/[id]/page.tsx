import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Badge } from "@/components/ui/badge";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import type { TipoCliente } from "@/generated/prisma/client";

type No = {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string | null;
  orientacao: string | null;
  fundamento: string | null;
  avaliavel: boolean;
  tiposEntidade: TipoCliente[];
  paiId: string | null;
  filhos: No[];
};

async function carregar(id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  return db.norma.findUnique({
    where: { id },
    select: {
      id: true,
      codigo: true,
      titulo: true,
      orgaoEmissor: true,
      fonteUrl: true,
      descricao: true,
      requisitos: {
        orderBy: { ordem: "asc" },
        select: {
          id: true,
          codigo: true,
          titulo: true,
          descricao: true,
          orientacao: true,
          fundamento: true,
          avaliavel: true,
          tiposEntidade: true,
          paiId: true,
        },
      },
    },
  });
}

export async function generateMetadata({ params }: PageProps<"/normas/[id]">): Promise<Metadata> {
  const norma = await carregar((await params).id);
  return { title: norma?.codigo ?? "Norma" };
}

function montarArvore(itens: Omit<No, "filhos">[]): No[] {
  const mapa = new Map<string, No>(itens.map((i) => [i.id, { ...i, filhos: [] }]));
  const raizes: No[] = [];
  for (const no of mapa.values()) {
    const pai = no.paiId ? mapa.get(no.paiId) : undefined;
    if (pai) pai.filhos.push(no);
    else raizes.push(no);
  }
  return raizes;
}

function Requisito({ no, tipo, nivel }: { no: No; tipo: TipoCliente; nivel: number }) {
  const aplicavel = no.tiposEntidade.includes(tipo);
  return (
    <li className={cn(nivel > 0 && "border-l pl-4", !aplicavel && "opacity-55")}>
      <div className={cn("space-y-1.5 py-3", nivel === 0 && "pt-5")}>
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-xs font-medium text-muted-foreground">{no.codigo}</span>
          <span className={cn(nivel === 0 ? "font-heading text-base font-semibold" : "font-medium")}>{no.titulo}</span>
          {!aplicavel && <Badge variant="outline">não se aplica a {TIPO_CLIENTE[tipo].toLowerCase()}</Badge>}
          {no.avaliavel && aplicavel && <Badge variant="secondary">avaliável</Badge>}
        </div>
        {no.descricao && <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">{no.descricao}</p>}
        {no.fundamento && <p className="text-xs text-muted-foreground">Fundamento: {no.fundamento}</p>}
        {no.orientacao && (
          <p className="max-w-4xl rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">{no.orientacao}</p>
        )}
      </div>
      {no.filhos.length > 0 && (
        <ul>
          {no.filhos.map((f) => (
            <Requisito key={f.id} no={f} tipo={tipo} nivel={nivel + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default async function DetalheNorma({ params }: PageProps<"/normas/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const norma = await carregar((await params).id);
  if (!norma) notFound();
  const arvore = montarArvore(norma.requisitos);
  const avaliaveis = norma.requisitos.filter((r) => r.avaliavel && r.tiposEntidade.includes(ctx.cliente.tipo)).length;

  return (
    <>
      <Link href="/normas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Normas
      </Link>
      <CabecalhoPagina
        titulo={norma.titulo}
        descricao={`${norma.orgaoEmissor} · ${avaliaveis} requisitos avaliáveis para ${TIPO_CLIENTE[ctx.cliente.tipo].toLowerCase()}.`}
        acoes={
          norma.fonteUrl && (
            <a
              href={norma.fonteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Texto oficial <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )
        }
      />
      <ul className="divide-y rounded-xl border bg-card px-5 pb-3">
        {arvore.map((no) => (
          <Requisito key={no.id} no={no} tipo={ctx.cliente.tipo} nivel={0} />
        ))}
      </ul>
    </>
  );
}
