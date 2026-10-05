import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, ClipboardCheck, ListTodo, SearchCheck } from "lucide-react";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { obterDemanda, prorrogacaoPendente } from "@/lib/dados/demandas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ListaAnexos } from "@/components/anexos/lista-anexos";
import { LinhaDoTempo } from "@/components/demandas/linha-do-tempo";
import { PrioridadeDemanda, SituacaoCompleta } from "@/components/demandas/situacao";
import { formatarDataHora, formatarDataSimples, hojeComoDataSimples, paraCampoData, somarDias } from "@/lib/datas";
import { descricaoPrazo, numeroDemanda } from "@/lib/demandas";
import { cn } from "@/lib/utils";
import { AcoesControle, FormComentario } from "./acoes-controle";

export const metadata: Metadata = { title: "Demanda" };

export default async function DetalheDemanda(props: PageProps<"/demandas/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const { id } = await props.params;
  if (!z.uuid().safeParse(id).success) notFound();
  const d = await obterDemanda(ctx, id);
  if (!d) notFound();

  const criador = await db.usuario.findUnique({ where: { id: d.criadoPorId }, select: { nome: true } });
  const pedido = prorrogacaoPendente(d.tramites);
  const prazo = descricaoPrazo(d);
  const anexosIniciais = [...d.documentos, ...(d.tramites.find((t) => t.tipo === "ENVIO")?.documentos ?? [])];
  const amanha = paraCampoData(somarDias(hojeComoDataSimples(), 1));

  return (
    <>
      <CabecalhoPagina
        titulo={d.assunto}
        descricao={`Demanda nº ${numeroDemanda(d.numero, d.ano)} · ${d.unidadeDestino.nome}`}
        acoes={
          <Link href="/demandas" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Voltar às demandas
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-medium">Solicitação</h2>
            </CardHeader>
            <CardContent className="space-y-5">
              <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Número</dt>
                  <dd className="font-mono font-semibold">{numeroDemanda(d.numero, d.ano)}</dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Situação</dt>
                  <dd>
                    <SituacaoCompleta status={d.status} prazo={d.prazo} />
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Prioridade</dt>
                  <dd>
                    <PrioridadeDemanda prioridade={d.prioridade} />
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Unidade destinatária</dt>
                  <dd>
                    {d.unidadeDestino.sigla && <span className="mr-1 font-mono text-xs font-semibold text-primary">{d.unidadeDestino.sigla}</span>}
                    {d.unidadeDestino.nome}
                    {d.unidadeDestino.responsavelNome && (
                      <span className="block text-xs text-muted-foreground">Responsável: {d.unidadeDestino.responsavelNome}</span>
                    )}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Prazo</dt>
                  <dd>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <CalendarClock aria-hidden="true" className="size-4 text-muted-foreground" />
                      {formatarDataSimples(d.prazo)}
                    </span>
                    {prazo && (
                      <span className={cn("block text-xs", prazo.tom === "perigo" ? "font-medium text-perigo" : "text-muted-foreground")}>
                        {prazo.texto}
                      </span>
                    )}
                  </dd>
                </div>
                <div className="space-y-1">
                  <dt className="text-muted-foreground">Enviada em</dt>
                  <dd>
                    {formatarDataHora(d.criadoEm)}
                    {criador && <span className="block text-xs text-muted-foreground">por {criador.nome}</span>}
                  </dd>
                </div>
                {(d.respostaRequisito || d.acao || d.auditoria) && (
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <dt className="text-muted-foreground">Origem</dt>
                    {d.respostaRequisito && (
                      <dd className="flex items-start gap-1.5">
                        <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <Link
                            href={`/autoavaliacao/${d.respostaRequisito.cicloId}#req-${d.respostaRequisito.requisito.id}`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            Requisito <span className="font-mono">{d.respostaRequisito.requisito.codigo}</span> — {d.respostaRequisito.requisito.titulo}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            Autoavaliação “{d.respostaRequisito.ciclo.nome}”. Ao concluir, os documentos da resposta viram evidência do requisito.
                          </span>
                        </span>
                      </dd>
                    )}
                    {d.acao && (
                      <dd className="flex items-start gap-1.5">
                        <ListTodo aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <Link href={`/planos/${d.acao.planoId}`} className="font-medium text-primary underline-offset-4 hover:underline">
                            Ação: {d.acao.oQue}
                          </Link>
                          <span className="block text-xs text-muted-foreground">
                            Plano de ação “{d.acao.plano.titulo}”. Ao concluir, os documentos da resposta viram evidência da ação.
                          </span>
                        </span>
                      </dd>
                    )}
                    {d.auditoria && (
                      <dd className="flex items-start gap-1.5">
                        <SearchCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                        <span>
                          <Link href={`/auditorias/${d.auditoria.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                            Auditoria {String(d.auditoria.numero).padStart(3, "0")}/{d.auditoria.ano} — {d.auditoria.titulo}
                          </Link>
                          <span className="block text-xs text-muted-foreground">Solicitação de auditoria.</span>
                        </span>
                      </dd>
                    )}
                  </div>
                )}
              </dl>
              <div className="space-y-1.5">
                <h3 className="text-sm text-muted-foreground">Descrição</h3>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{d.descricao}</p>
              </div>
              {anexosIniciais.length > 0 && (
                <div className="space-y-1.5">
                  <h3 className="text-sm text-muted-foreground">Anexos da solicitação</h3>
                  <ListaAnexos anexos={anexosIniciais} rotulo="Anexos da solicitação" />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-medium">Tramitação</h2>
              <p className="text-sm text-muted-foreground">Histórico permanente: os registros não podem ser alterados nem excluídos.</p>
            </CardHeader>
            <CardContent>
              <LinhaDoTempo itens={d.tramites.map((t) => (t.tipo === "ENVIO" ? { ...t, documentos: [] } : t))} />
            </CardContent>
          </Card>
        </div>

        <aside aria-label="Ações da controladoria" className="space-y-6">
          <AcoesControle
            demandaId={d.id}
            status={d.status}
            prazoAtual={paraCampoData(d.prazo)}
            prazoMinimo={amanha}
            pedido={pedido ? { texto: pedido.texto, novoPrazo: pedido.novoPrazo ? paraCampoData(pedido.novoPrazo) : null, usuarioNome: pedido.usuarioNome } : null}
            evidenciaDe={[d.respostaRequisito && "do requisito", d.acao && "da ação"].filter(Boolean).join(" e ") || undefined}
          />
          <Card>
            <CardHeader>
              <h2 className="font-heading text-base font-medium">Comentar</h2>
              <p className="text-sm text-muted-foreground">Por padrão, o comentário é interno e não aparece para a unidade.</p>
            </CardHeader>
            <CardContent>
              <FormComentario demandaId={d.id} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
