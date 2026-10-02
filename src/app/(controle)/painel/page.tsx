import type { Metadata } from "next";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlarmClock, ArrowRight, ClipboardList, Inbox, MessageSquareReply, Network } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { resumoPainel } from "@/lib/dados/painel";
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
        <Indicador rotulo="Demandas vencidas" valor={r.demandasVencidas} icone={AlarmClock} tom="perigo" detalhe="Prazo expirado sem resposta" />
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
                  <Link href={`/normas/${n.normaId}`} className="font-medium hover:underline">
                    {n.titulo}
                  </Link>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                    {n.percentual === null ? "sem avaliação" : `${n.percentual}%`}
                  </span>
                </div>
                <Progress value={n.percentual ?? 0} aria-label={`Aderência à ${n.codigo}`} />
                <p className="text-xs text-muted-foreground">
                  {n.ciclo
                    ? `${n.ciclo.nome}: ${n.avaliados} de ${n.totalRequisitos} requisitos avaliados`
                    : `${n.totalRequisitos} requisitos aplicáveis ao tipo ${TIPO_CLIENTE[ctx.cliente.tipo]}. Nenhum ciclo iniciado.`}
                </p>
              </div>
            ))}
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
