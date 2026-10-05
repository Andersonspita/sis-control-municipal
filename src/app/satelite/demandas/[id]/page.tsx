import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, CheckCircle2, Hourglass, Info, Undo2 } from "lucide-react";
import { z } from "zod";
import { exigirContexto } from "@/lib/auth/dal";
import { obterDemanda, prorrogacaoPendente } from "@/lib/dados/demandas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ListaAnexos } from "@/components/anexos/lista-anexos";
import { LinhaDoTempo } from "@/components/demandas/linha-do-tempo";
import { PrioridadeDemanda, SituacaoCompleta } from "@/components/demandas/situacao";
import { formatarDataSimples, hojeComoDataSimples, paraCampoData, somarDias } from "@/lib/datas";
import { descricaoPrazo, numeroDemanda, STATUS_AGUARDANDO_UNIDADE } from "@/lib/demandas";
import { cn } from "@/lib/utils";
import { FormProrrogacao, FormResposta, MarcarVisualizada } from "./formularios";

export const metadata: Metadata = { title: "Demanda" };

function Aviso({ icone: Icone, tom, children }: { icone: typeof Hourglass; tom: "alerta" | "sucesso" | "info"; children: React.ReactNode }) {
  const cores = { alerta: "border-alerta/50 bg-alerta/10", sucesso: "border-sucesso/40 bg-sucesso/10", info: "border-info/40 bg-info/10" };
  const icones = { alerta: "text-alerta", sucesso: "text-sucesso", info: "text-info" };
  return (
    <div role="status" className={cn("flex gap-3 rounded-xl border px-4 py-3 text-sm", cores[tom])}>
      <Icone aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", icones[tom])} />
      <div className="space-y-1">{children}</div>
    </div>
  );
}

export default async function DemandaSatelite(props: PageProps<"/satelite/demandas/[id]">) {
  const ctx = await exigirContexto(["SATELITE"]);
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await obterDemanda(ctx, id);
  if (!d) notFound();

  const prazo = descricaoPrazo(d);
  const pedido = prorrogacaoPendente(d.tramites);
  const aguardando = STATUS_AGUARDANDO_UNIDADE.includes(d.status);
  const devolucao = d.status === "DEVOLVIDA" ? d.tramites.findLast((t) => t.tipo === "DEVOLUCAO") : undefined;
  const anexosIniciais = [...d.documentos, ...(d.tramites.find((t) => t.tipo === "ENVIO")?.documentos ?? [])];
  const minimoProrrogacao = paraCampoData(
    somarDias(d.prazo > hojeComoDataSimples() ? d.prazo : hojeComoDataSimples(), 1),
  );

  return (
    <>
      {d.status === "ENVIADA" && <MarcarVisualizada demandaId={d.id} />}
      <CabecalhoPagina
        titulo={d.assunto}
        descricao={`Demanda nº ${numeroDemanda(d.numero, d.ano)} da controladoria para ${d.unidadeDestino.nome}`}
        acoes={
          <Link href="/satelite" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Minhas demandas
          </Link>
        }
      />

      <div className="mx-auto max-w-3xl space-y-6">
        {devolucao && (
          <Aviso icone={Undo2} tom="alerta">
            <p className="font-medium">A controladoria pediu complementação da resposta.</p>
            {devolucao.texto && <p className="whitespace-pre-wrap">{devolucao.texto}</p>}
          </Aviso>
        )}
        {(d.status === "RESPONDIDA" || d.status === "EM_ANALISE") && (
          <Aviso icone={Hourglass} tom="info">
            <p className="font-medium">Resposta enviada.</p>
            <p>A controladoria vai analisar e, se necessário, pedir complementação. Você será avisado nesta página.</p>
          </Aviso>
        )}
        {d.status === "CONCLUIDA" && (
          <Aviso icone={CheckCircle2} tom="sucesso">
            <p className="font-medium">Demanda concluída. Obrigado pela resposta.</p>
          </Aviso>
        )}
        {pedido && aguardando && (
          <Aviso icone={CalendarClock} tom="info">
            <p className="font-medium">
              Pedido de prorrogação{pedido.novoPrazo ? ` para ${formatarDataSimples(pedido.novoPrazo)}` : ""} aguardando decisão.
            </p>
            <p>Até a decisão, vale o prazo atual.</p>
          </Aviso>
        )}

        <Card>
          <CardHeader>
            <h2 className="font-heading text-base font-medium">O que a controladoria pediu</h2>
          </CardHeader>
          <CardContent className="space-y-5">
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div className="space-y-1">
                <dt className="text-muted-foreground">Situação</dt>
                <dd>
                  <SituacaoCompleta status={d.status} prazo={d.prazo} />
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">Prazo para resposta</dt>
                <dd>
                  <span className="font-medium tabular-nums">{formatarDataSimples(d.prazo)}</span>
                  {prazo && (
                    <span className={cn("block text-xs", prazo.tom === "perigo" ? "font-medium text-perigo" : "text-muted-foreground")}>
                      {prazo.texto}
                    </span>
                  )}
                </dd>
              </div>
              <div className="space-y-1">
                <dt className="text-muted-foreground">Prioridade</dt>
                <dd>
                  <PrioridadeDemanda prioridade={d.prioridade} />
                </dd>
              </div>
            </dl>
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{d.descricao}</p>
            {(d.respostaRequisitoId || d.acao) && (
              <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {d.acao
                    ? `Solicitação ligada à ação “${d.acao.oQue}” do plano de ação “${d.acao.plano.titulo}”.`
                    : "Solicitação ligada à autoavaliação do controle interno."}{" "}
                  Os documentos da sua resposta, quando aceitos, servem de comprovação.
                </span>
              </p>
            )}
            {anexosIniciais.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm text-muted-foreground">Documentos enviados pela controladoria</h3>
                <ListaAnexos anexos={anexosIniciais} rotulo="Documentos enviados pela controladoria" />
              </div>
            )}
          </CardContent>
        </Card>

        {aguardando && (
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-medium">{d.status === "DEVOLVIDA" ? "Complementar resposta" : "Responder"}</h2>
              <p className="text-sm text-muted-foreground">Escreva a resposta e anexe os documentos solicitados.</p>
            </CardHeader>
            <CardContent>
              <FormResposta demandaId={d.id} />
            </CardContent>
          </Card>
        )}

        {aguardando && !pedido && (
          <Card size="sm">
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">Precisa de mais prazo?</p>
                <p className="text-sm text-muted-foreground">Peça prorrogação com justificativa. A controladoria decide.</p>
              </div>
              <FormProrrogacao demandaId={d.id} prazoAtual={formatarDataSimples(d.prazo)} minimo={minimoProrrogacao} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <h2 className="font-heading text-base font-medium">Histórico</h2>
          </CardHeader>
          <CardContent>
            <LinhaDoTempo itens={d.tramites.map((t) => (t.tipo === "ENVIO" ? { ...t, documentos: [] } : t))} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
