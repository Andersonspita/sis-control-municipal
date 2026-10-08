import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlarmClock, ArrowLeft, CircleCheck, ClipboardCheck, Hourglass, ListTodo, Siren } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { carregarPlano } from "@/lib/dados/planos";
import { numeroSituacao } from "@/lib/dados/alertas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SeloStatusPlano } from "@/components/selos-status";
import { ORIGEM_PLANO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { TabelaAcoes } from "./tabela-acoes";
import { StatusPlano } from "./status-plano";

export const metadata: Metadata = { title: "Plano de ação" };

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Bahia" });

function Numero({
  rotulo,
  valor,
  icone: Icone,
  destaque,
}: {
  rotulo: string;
  valor: number;
  icone: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  destaque?: "perigo" | "alerta" | "sucesso";
}) {
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-md",
            destaque === "perigo" && valor > 0
              ? "bg-perigo/12 text-perigo"
              : destaque === "alerta" && valor > 0
                ? "bg-alerta/15 text-alerta"
                : destaque === "sucesso" && valor > 0
                  ? "bg-sucesso/12 text-sucesso"
                  : "bg-primary/10 text-primary",
          )}
        >
          <Icone aria-hidden className="size-4" />
        </span>
        <div>
          <p className="font-heading text-xl font-semibold tabular-nums">{valor}</p>
          <p className="text-xs text-muted-foreground">{rotulo}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function DetalhePlano({ params }: PageProps<"/planos/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = await carregarPlano(ctx, (await params).id);
  if (!dados) notFound();
  const { plano, acoes, unidades, resumo } = dados;
  const encerrado = plano.status === "CONCLUIDO" || plano.status === "CANCELADO";

  return (
    <>
      <Link href="/planos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Planos de ação
      </Link>
      <CabecalhoPagina
        titulo={plano.titulo}
        descricao={[
          `Origem: ${ORIGEM_PLANO[plano.origem]}`,
          `criado em ${data.format(plano.criadoEm)}${plano.criadoPor ? ` por ${plano.criadoPor}` : ""}`,
        ].join(" · ")}
        acoes={ctx.perfil === "CONTROLADOR" ? <StatusPlano planoId={plano.id} status={plano.status} /> : <SeloStatusPlano status={plano.status} />}
      />

      {(plano.descricao || plano.ciclo || plano.situacao) && (
        <div className="mb-6 space-y-2 text-sm">
          {plano.descricao && <p className="max-w-3xl text-muted-foreground">{plano.descricao}</p>}
          {plano.ciclo && (
            <Link href={`/autoavaliacao/${plano.ciclo.id}`} className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline">
              <ClipboardCheck aria-hidden="true" className="size-4" />
              Ciclo de origem: {plano.ciclo.nome} · <span className="font-mono">{plano.ciclo.norma.codigo}</span>
            </Link>
          )}
          {plano.situacao && (
            <Link href={`/alertas/${plano.situacao.id}`} className="flex w-fit items-center gap-1.5 font-medium text-primary hover:underline">
              <Siren aria-hidden="true" className="size-4" />
              Situação de origem: <span className="font-mono">{numeroSituacao(plano.situacao.numero, plano.situacao.ano)}</span> ·{" "}
              {plano.situacao.titulo}
            </Link>
          )}
        </div>
      )}

      <section aria-label="Resumo do plano" className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Card size="sm" className="sm:col-span-2 lg:col-span-1">
          <CardContent className="space-y-2">
            <p className="text-xs text-muted-foreground">Execução do plano</p>
            <p className="font-heading text-xl font-semibold tabular-nums">{resumo.executado === null ? "—" : `${resumo.executado}%`}</p>
            <Progress value={resumo.executado ?? 0} aria-label="Execução do plano" />
          </CardContent>
        </Card>
        <Numero rotulo="Abertas" valor={resumo.abertas} icone={ListTodo} />
        <Numero rotulo="Vencidas" valor={resumo.vencidas} icone={AlarmClock} destaque="perigo" />
        <Numero rotulo="Aguardando validação" valor={resumo.aguardando} icone={Hourglass} destaque="alerta" />
        <Numero rotulo="Concluídas" valor={resumo.concluidas} icone={CircleCheck} destaque="sucesso" />
      </section>

      <TabelaAcoes
        planoId={plano.id}
        situacaoPlano={plano.status}
        acoes={acoes}
        unidades={unidades}
        podeAdicionar={!encerrado}
        podeValidar={ctx.perfil === "CONTROLADOR"}
      />
    </>
  );
}
