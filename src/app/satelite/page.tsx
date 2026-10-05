import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChevronRight, Paperclip } from "lucide-react";
import { formatarDataSimples } from "@/lib/datas";
import { exigirContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { PrioridadeDemanda, SituacaoCompleta } from "@/components/demandas/situacao";
import { descricaoPrazo, numeroDemanda, STATUS_AGUARDANDO_CONTROLE, STATUS_AGUARDANDO_UNIDADE } from "@/lib/demandas";
import { cn } from "@/lib/utils";
import type { Prioridade, StatusDemanda } from "@/generated/prisma/client";

export const metadata: Metadata = { title: "Minhas demandas" };

type Demanda = {
  id: string;
  numero: number;
  ano: number;
  assunto: string;
  prazo: Date;
  prioridade: Prioridade;
  status: StatusDemanda;
  unidadeDestino: { nome: string; sigla: string | null };
  _count: { documentos: number };
};

function ItemDemanda({ d }: { d: Demanda }) {
  const prazo = descricaoPrazo(d);
  return (
    <li>
      <Card size="sm" className="relative transition-shadow focus-within:ring-2 focus-within:ring-ring hover:ring-foreground/20">
        <CardContent className="flex items-center gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-muted-foreground">Nº {numeroDemanda(d.numero, d.ano)}</span>
              <SituacaoCompleta status={d.status} prazo={d.prazo} />
              {(d.prioridade === "ALTA" || d.prioridade === "URGENTE") && <PrioridadeDemanda prioridade={d.prioridade} />}
            </div>
            <h3 className="font-heading text-base font-semibold">
              <Link href={`/satelite/demandas/${d.id}`} className="outline-none after:absolute after:inset-0 hover:underline">
                {d.assunto}
              </Link>
            </h3>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
              <span className={cn("inline-flex items-center gap-1.5", prazo?.tom === "perigo" && "font-medium text-perigo")}>
                <CalendarClock aria-hidden="true" className="size-4" />
                Prazo {formatarDataSimples(d.prazo)}
                {prazo && ` · ${prazo.texto}`}
              </span>
              <span>{d.unidadeDestino.sigla ?? d.unidadeDestino.nome}</span>
              {d._count.documentos > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Paperclip aria-hidden="true" className="size-3.5" />
                  {d._count.documentos} {d._count.documentos === 1 ? "anexo" : "anexos"}
                </span>
              )}
            </p>
          </div>
          <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
        </CardContent>
      </Card>
    </li>
  );
}

function Secao({ titulo, descricao, demandas, vazio }: { titulo: string; descricao: string; demandas: Demanda[]; vazio: string }) {
  const id = `secao-${titulo.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="font-heading text-lg font-semibold">
          {titulo} <span className="text-sm font-normal text-muted-foreground">({demandas.length})</span>
        </h2>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      {demandas.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{vazio}</p>
      ) : (
        <ul className="space-y-3">
          {demandas.map((d) => (
            <ItemDemanda key={d.id} d={d} />
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function MinhasDemandas() {
  const ctx = await exigirContexto(["SATELITE"]);
  // O RLS restringe às demandas das unidades do escopo do usuário (e subordinadas).
  const demandas = await comCliente(ctx, (tx) =>
    tx.demanda.findMany({
      orderBy: [{ prazo: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        numero: true,
        ano: true,
        assunto: true,
        prazo: true,
        prioridade: true,
        status: true,
        unidadeDestino: { select: { nome: true, sigla: true } },
        _count: { select: { documentos: true } },
      },
    }),
  );

  const aguardando = demandas.filter((d) => STATUS_AGUARDANDO_UNIDADE.includes(d.status));
  const emAnalise = demandas.filter((d) => STATUS_AGUARDANDO_CONTROLE.includes(d.status));
  const encerradas = demandas.filter((d) => d.status === "CONCLUIDA" || d.status === "CANCELADA").reverse();

  return (
    <>
      <CabecalhoPagina
        titulo="Minhas demandas"
        descricao="Solicitações da controladoria encaminhadas à sua unidade. Abra a demanda para responder e anexar os documentos pedidos."
      />
      <div className="mx-auto max-w-3xl space-y-10">
        <Secao
          titulo="Aguardando sua resposta"
          descricao="Responda dentro do prazo. Se precisar de mais tempo, peça prorrogação na própria demanda."
          demandas={aguardando}
          vazio="Nenhuma demanda aguardando resposta."
        />
        <Secao
          titulo="Em análise pela controladoria"
          descricao="Você já respondeu. A controladoria pode concluir ou pedir complementação."
          demandas={emAnalise}
          vazio="Nenhuma resposta em análise."
        />
        {encerradas.length > 0 && (
          <Secao titulo="Encerradas" descricao="Demandas concluídas ou canceladas." demandas={encerradas} vazio="" />
        )}
      </div>
    </>
  );
}
