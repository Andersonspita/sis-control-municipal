import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlarmClock,
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Hourglass,
  Inbox,
  ListTodo,
  MessageSquareReply,
  Network,
} from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { resumoPainel } from "@/lib/dados/painel";
import { formatarPercentual } from "@/lib/dados/conformidade";
import { SeloStatusCiclo } from "@/components/selos-status";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Painel" };

const TRAMITE: Record<string, string> = {
  ENVIO: "enviou a demanda",
  VISUALIZACAO: "visualizou",
  RESPOSTA: "respondeu",
  ANALISE: "iniciou a análise",
  DEVOLUCAO: "devolveu para complementação",
  CONCLUSAO: "concluiu",
  CANCELAMENTO: "cancelou",
  PRORROGACAO_SOLICITADA: "pediu prorrogação",
  PRORROGACAO_DEFERIDA: "deferiu a prorrogação",
  PRORROGACAO_INDEFERIDA: "indeferiu a prorrogação",
  COMENTARIO: "comentou",
};

function Indicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom = "neutro",
}: {
  rotulo: string;
  valor: number;
  detalhe?: string;
  icone: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tom?: "neutro" | "alerta" | "perigo";
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{rotulo}</p>
          <p className="font-heading text-3xl font-semibold tabular-nums">{valor}</p>
          {detalhe && <p className="text-xs text-muted-foreground">{detalhe}</p>}
        </div>
        <span
          className={cn(
            "flex size-10 items-center justify-center rounded-md",
            tom === "perigo" && valor > 0 ? "bg-perigo/12 text-perigo" : tom === "alerta" && valor > 0 ? "bg-alerta/15 text-alerta" : "bg-primary/10 text-primary",
          )}
        >
          <Icone aria-hidden className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function Painel() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const r = await resumoPainel(ctx);

  return (
    <>
      <CabecalhoPagina
        titulo="Painel"
        descricao={`Visão geral do controle interno — ${ctx.cliente.nome} (${TIPO_CLIENTE[ctx.cliente.tipo]}).`}
      />

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Demandas em aberto" valor={r.demandasAbertas} icone={Inbox} />
        <Indicador rotulo="Demandas vencidas" valor={r.demandasVencidas} icone={AlarmClock} tom="perigo" detalhe="Prazo expirado e ainda não concluídas" />
        <Indicador rotulo="Respostas a analisar" valor={r.aguardandoAnalise} icone={MessageSquareReply} tom="alerta" />
        <Indicador
          rotulo="Ações em execução"
          valor={r.acoesPendentes}
          icone={ClipboardList}
          tom={r.acoesAtrasadas ? "perigo" : "neutro"}
          detalhe={r.acoesAtrasadas ? `${r.acoesAtrasadas} com prazo vencido` : "Nenhuma atrasada"}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Aderência às normas</CardTitle>
            <CardDescription>Resultado do ciclo de autoavaliação mais recente de cada norma.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {r.aderencia.map((n) => (
              <div key={n.normaId} className="space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <Link href={n.ciclo ? `/autoavaliacao/${n.ciclo.id}` : `/normas/${n.normaId}`} className="font-medium hover:underline">
                    {n.titulo}
                  </Link>
                  <span className="shrink-0 text-sm font-medium tabular-nums">
                    {n.indice === null ? <span className="font-normal text-muted-foreground">sem avaliação</span> : formatarPercentual(n.indice)}
                  </span>
                </div>
                <Progress value={n.percentual ?? 0} aria-label={`Aderência à ${n.codigo}`} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  {n.ciclo ? (
                    <>
                      <SeloStatusCiclo status={n.ciclo.status} />
                      <span>
                        {n.ciclo.nome}: {n.avaliados} de {n.totalRequisitos} requisitos avaliados
                      </span>
                      {(n.contagem.NAO_ATENDIDO > 0 || n.contagem.PARCIALMENTE_ATENDIDO > 0) && (
                        <span>
                          · {n.contagem.NAO_ATENDIDO} não atendidos, {n.contagem.PARCIALMENTE_ATENDIDO} parciais
                        </span>
                      )}
                    </>
                  ) : (
                    <span>
                      {n.totalRequisitos} requisitos aplicáveis ao tipo {TIPO_CLIENTE[ctx.cliente.tipo]}. Nenhum ciclo iniciado.
                    </span>
                  )}
                </div>
              </div>
            ))}
            <Link href="/autoavaliacao" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ir para a autoavaliação <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Movimentações recentes</CardTitle>
            <CardDescription>Últimos trâmites das demandas.</CardDescription>
          </CardHeader>
          <CardContent>
            {r.recentes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
            ) : (
              <ol className="space-y-4">
                {r.recentes.map((t) => (
                  <li key={t.id} className="flex gap-3 text-sm">
                    <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p>
                        <span className="font-medium">{t.usuarioNome}</span> {TRAMITE[t.tipo] ?? t.tipo}
                      </p>
                      <p className="truncate text-muted-foreground">
                        Demanda {String(t.demanda.numero).padStart(3, "0")}/{t.demanda.ano} — {t.demanda.assunto}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(t.criadoEm, { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Planos de ação</CardTitle>
          <CardDescription>Situação das ações 5W2H de todos os planos.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { rotulo: "Abertas", valor: r.acoes.abertas, icone: ListTodo, tom: "neutro" as const },
              { rotulo: "Vencidas", valor: r.acoes.vencidas, icone: AlarmClock, tom: "perigo" as const },
              { rotulo: "Aguardando validação", valor: r.acoes.aguardandoValidacao, icone: Hourglass, tom: "alerta" as const },
              { rotulo: "Concluídas", valor: r.acoes.concluidas, icone: CircleCheck, tom: "sucesso" as const },
            ].map(({ rotulo, valor, icone: Icone, tom }) => (
              <li key={rotulo} className="flex items-center gap-3 rounded-lg border px-4 py-3">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md",
                    valor === 0 || tom === "neutro"
                      ? "bg-primary/10 text-primary"
                      : tom === "perigo"
                        ? "bg-perigo/12 text-perigo"
                        : tom === "alerta"
                          ? "bg-alerta/15 text-alerta"
                          : "bg-sucesso/12 text-sucesso",
                  )}
                >
                  <Icone aria-hidden="true" className="size-4" />
                </span>
                <div>
                  <p className="font-heading text-2xl font-semibold tabular-nums">{valor}</p>
                  <p className="text-xs text-muted-foreground">{rotulo}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/planos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Ver planos de ação <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Network aria-hidden="true" className="size-5" />
            </span>
            <div>
              <p className="font-medium">{r.unidades} unidades cadastradas</p>
              <p className="text-sm text-muted-foreground">Secretarias e setores que recebem demandas e respondem por ações.</p>
            </div>
          </div>
          <Link href="/unidades" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
            Gerenciar unidades <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </CardContent>
      </Card>
    </>
  );
}
