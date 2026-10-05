import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarRange, ClipboardList, ListPlus, Send, Trash2 } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { carregarAuditoria, rotuloUnidade } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Evidencias } from "@/components/anexos/evidencias";
import { ListaAnexos } from "@/components/anexos/lista-anexos";
import { SeloGravidade } from "@/components/medidas/selos";
import { SeloStatusAcao, SeloStatusPlano, SeloVencida } from "@/components/selos-status";
import { SituacaoDemanda } from "@/components/demandas/situacao";
import { SeloResultadoItem, SeloStatusAuditoria } from "@/components/auditorias/selos";
import {
  ETAPAS_AUDITORIA,
  numeroAuditoria,
  STATUS_APLICA_CHECKLIST,
  STATUS_AUDITORIA_FINAIS,
  STATUS_AVALIA_CHECKLIST,
  STATUS_EDITA_ACHADOS,
  STATUS_EDITA_PLANEJAMENTO,
  STATUS_GERA_ACAO,
  STATUS_SOLICITA,
} from "@/lib/auditorias";
import { formatarDataHora, formatarDataSimples, paraCampoData } from "@/lib/datas";
import { numeroDemanda } from "@/lib/demandas";
import { RESULTADO_ITEM_CHECKLIST, STATUS_AUDITORIA, TIPO_AUDITORIA } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { excluirAchado, excluirQuestao, excluirRecomendacao, gerarAcaoDaRecomendacao, removerChecklist } from "../actions";
import { BotaoAcao } from "../botao-acao";
import { DialogoEditarAuditoria, DialogoStatusAuditoria } from "./acoes-auditoria";
import { DialogoQuestao } from "./planejamento";
import { AplicarChecklist, FormAvaliacaoItem } from "./execucao";
import { DialogoAchado, DialogoRecomendacao } from "./achados";

export const metadata: Metadata = { title: "Auditoria" };

const ABAS = ["planejamento", "execucao", "achados", "solicitacoes", "documentos", "historico"] as const;

const HISTORICO: Record<string, string> = {
  "auditoria.criada": "Registrou a auditoria",
  "auditoria.atualizada": "Editou o planejamento",
  "auditoria.status_alterado": "Mudou a etapa",
  "auditoria.encerrada": "Encerrou a auditoria",
  "auditoria.cancelada": "Cancelou a auditoria",
  "auditoria.questao_criada": "Incluiu questão na matriz",
  "auditoria.questao_atualizada": "Editou questão da matriz",
  "auditoria.questao_excluida": "Excluiu questão da matriz",
  "auditoria.checklist_aplicado": "Aplicou checklist",
  "auditoria.checklist_removido": "Removeu checklist",
  "auditoria.item_avaliado": "Avaliou item de checklist",
  "achado.criado": "Registrou achado",
  "achado.atualizado": "Editou achado",
  "achado.excluido": "Excluiu achado",
  "recomendacao.criada": "Incluiu recomendação",
  "recomendacao.atualizada": "Editou recomendação",
  "recomendacao.excluida": "Excluiu recomendação",
  "plano.criado": "Criou o plano de ação da auditoria",
  "acao.criada": "Gerou ação a partir de recomendação",
  "demanda.criada": "Enviou solicitação de auditoria",
  "documento.enviado": "Anexou documento",
};

function detalheHistorico(acao: string, dados: unknown): string | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as Record<string, unknown>;
  const texto = (v: unknown) => (typeof v === "string" ? v : null);
  if (acao.startsWith("auditoria.") && texto(d.de) && texto(d.para) && acao !== "auditoria.item_avaliado") {
    const r = (v: unknown) => STATUS_AUDITORIA[v as keyof typeof STATUS_AUDITORIA] ?? String(v);
    return [`${r(d.de)} → ${r(d.para)}`, texto(d.justificativa)].filter(Boolean).join(" · ");
  }
  if (acao === "auditoria.item_avaliado") {
    return RESULTADO_ITEM_CHECKLIST[d.para as keyof typeof RESULTADO_ITEM_CHECKLIST] ?? "Avaliação removida";
  }
  if (acao === "auditoria.atualizada" && Array.isArray(d.alterados)) return `Alterou: ${d.alterados.join(", ")}`;
  return texto(d.titulo) ?? texto(d.modelo) ?? texto(d.questao) ?? texto(d.texto) ?? texto(d.nome) ?? texto(d.assunto) ?? texto(d.oQue);
}

function Campo({ rotulo, children, className }: { rotulo: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-0.5", className)}>
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm whitespace-pre-line">{children}</dd>
    </div>
  );
}

export default async function DetalheAuditoria({ params, searchParams }: PageProps<"/auditorias/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = await carregarAuditoria(ctx, (await params).id);
  if (!dados) notFound();
  const abaPedida = (await searchParams).aba;
  const aba = ABAS.find((a) => a === abaPedida) ?? "planejamento";
  const { auditoria: a, plano, unidades, membros, modelos, historico } = dados;
  const numero = numeroAuditoria(a.numero, a.ano);
  const finalizada = STATUS_AUDITORIA_FINAIS.includes(a.status);
  const editaPlanejamento = STATUS_EDITA_PLANEJAMENTO.includes(a.status);
  const editaAchados = STATUS_EDITA_ACHADOS.includes(a.status);
  const avalia = STATUS_AVALIA_CHECKLIST.includes(a.status);
  const geraAcao = STATUS_GERA_ACAO.includes(a.status);
  const itensChecklist = a.checklists.flatMap((c) => c.itens.map((i) => ({ id: i.id, rotulo: `${c.nome} · ${i.ordem}. ${i.texto}`.slice(0, 160) })));
  const totalItens = a.checklists.reduce((n, c) => n + c.itens.length, 0);
  const avaliados = a.checklists.reduce((n, c) => n + c.itens.filter((i) => i.resultado).length, 0);
  const etapa = ETAPAS_AUDITORIA.indexOf(a.status);

  return (
    <>
      <Link href="/auditorias" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Auditorias
      </Link>
      <CabecalhoPagina
        titulo={a.titulo}
        descricao={[`Auditoria ${numero}`, TIPO_AUDITORIA[a.tipo], `registrada em ${formatarDataHora(a.criadoEm)}${a.criadoPor ? ` por ${a.criadoPor}` : ""}`].join(" · ")}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {editaPlanejamento && (
              <DialogoEditarAuditoria
                unidades={unidades}
                membros={membros}
                valores={{
                  id: a.id,
                  titulo: a.titulo,
                  tipo: a.tipo,
                  objetivo: a.objetivo,
                  escopo: a.escopo,
                  criterios: a.criterios,
                  unidadeId: a.unidadeId,
                  inicioPrevisto: a.inicioPrevisto ? paraCampoData(a.inicioPrevisto) : null,
                  fimPrevisto: a.fimPrevisto ? paraCampoData(a.fimPrevisto) : null,
                  equipeIds: a.equipeIds,
                }}
              />
            )}
            <DialogoStatusAuditoria key={a.status} auditoriaId={a.id} status={a.status} podeEncerrar={ctx.perfil === "CONTROLADOR"} />
          </div>
        }
      />

      <ol aria-label="Ciclo da auditoria" className="mb-6 flex flex-wrap items-center gap-1.5 text-xs">
        {ETAPAS_AUDITORIA.map((s, i) => (
          <li
            key={s}
            aria-current={s === a.status ? "step" : undefined}
            className={cn(
              "rounded-full border px-2.5 py-1",
              s === a.status ? "border-primary bg-primary text-primary-foreground" : i < etapa ? "border-primary/40 text-primary" : "text-muted-foreground",
            )}
          >
            {STATUS_AUDITORIA[s]}
          </li>
        ))}
        {a.status === "CANCELADA" && (
          <li className="ml-1">
            <SeloStatusAuditoria status="CANCELADA" />
          </li>
        )}
      </ol>
      {a.status === "CANCELADA" && a.justificativaCancelamento && (
        <p className="mb-6 rounded-lg border bg-muted/40 p-3 text-sm whitespace-pre-line">{a.justificativaCancelamento}</p>
      )}

      <Tabs defaultValue={aba}>
        <TabsList aria-label="Seções da auditoria" className="flex-wrap">
          <TabsTrigger value="planejamento" className="px-3">Planejamento</TabsTrigger>
          <TabsTrigger value="execucao" className="px-3">Execução ({avaliados}/{totalItens})</TabsTrigger>
          <TabsTrigger value="achados" className="px-3">Achados e recomendações ({a.achados.length})</TabsTrigger>
          <TabsTrigger value="solicitacoes" className="px-3">Solicitações ({a.demandas.length})</TabsTrigger>
          <TabsTrigger value="documentos" className="px-3">Documentos</TabsTrigger>
          <TabsTrigger value="historico" className="px-3">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="planejamento" className="space-y-6 pt-4">
          <Card>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Objetivo" className="sm:col-span-2">{a.objetivo}</Campo>
                <Campo rotulo="Escopo">{a.escopo ?? "—"}</Campo>
                <Campo rotulo="Critérios e normas">{a.criterios ?? "—"}</Campo>
                <Campo rotulo="Alcance">{a.unidade ? `Unidade: ${rotuloUnidade(a.unidade)}` : "Entidade inteira"}</Campo>
                <Campo rotulo="Período previsto">
                  {a.inicioPrevisto ? formatarDataSimples(a.inicioPrevisto) : "—"}
                  {a.fimPrevisto ? ` a ${formatarDataSimples(a.fimPrevisto)}` : ""}
                </Campo>
                <Campo rotulo="Equipe">{a.equipe.length ? a.equipe.map((m) => m.nome).join(", ") : "Não definida"}</Campo>
                <Campo rotulo="Origem">
                  {a.itemPlano ? (
                    <Link href={`/auditorias/paai?ano=${a.itemPlano.plano.ano}`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline">
                      <CalendarRange aria-hidden="true" className="size-3.5" /> Prevista no PAAI {a.itemPlano.plano.ano}
                    </Link>
                  ) : (
                    "Fora do PAAI"
                  )}
                </Campo>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Matriz de planejamento</CardTitle>
              {editaPlanejamento && <DialogoQuestao auditoriaId={a.id} />}
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="px-5 py-2 font-medium">Questão de auditoria</th>
                      <th scope="col" className="px-3 py-2 font-medium">Informações requeridas</th>
                      <th scope="col" className="px-3 py-2 font-medium">Fontes</th>
                      <th scope="col" className="px-3 py-2 font-medium">Procedimentos</th>
                      {editaPlanejamento && <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {a.questoes.map((q, i) => (
                      <tr key={q.id} className="border-b align-top last:border-0">
                        <td className="px-5 py-3 font-medium whitespace-pre-line">
                          {i + 1}. {q.questao}
                        </td>
                        <td className="px-3 py-3 whitespace-pre-line text-muted-foreground">{q.informacoes ?? "—"}</td>
                        <td className="px-3 py-3 whitespace-pre-line text-muted-foreground">{q.fontes ?? "—"}</td>
                        <td className="px-3 py-3 whitespace-pre-line text-muted-foreground">{q.procedimentos ?? "—"}</td>
                        {editaPlanejamento && (
                          <td className="px-3 py-2 whitespace-nowrap">
                            <DialogoQuestao auditoriaId={a.id} questao={q} />
                            <BotaoAcao acao={excluirQuestao.bind(null, a.id, q.id)} confirmar="Excluir esta questão da matriz?" variant="ghost" size="icon-sm" rotulo="Excluir questão">
                              <Trash2 aria-hidden="true" />
                            </BotaoAcao>
                          </td>
                        )}
                      </tr>
                    ))}
                    {a.questoes.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                          Nenhuma questão de auditoria na matriz.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execucao" className="space-y-6 pt-4">
          {STATUS_APLICA_CHECKLIST.includes(a.status) && (
            <Card>
              <CardContent className="space-y-2">
                <AplicarChecklist auditoriaId={a.id} modelos={modelos} />
                <p className="text-xs text-muted-foreground">
                  Os itens do modelo são copiados para esta auditoria.{" "}
                  <Link href="/auditorias/modelos" className="text-primary underline-offset-4 hover:underline">
                    Gerenciar modelos
                  </Link>
                  {a.status === "PLANEJAMENTO" && " · Os itens recebem resultado a partir da etapa de execução."}
                </p>
              </CardContent>
            </Card>
          )}
          {a.checklists.length === 0 && <p className="text-sm text-muted-foreground">Nenhum checklist aplicado.</p>}
          {a.checklists.map((c) => {
            const feitos = c.itens.filter((i) => i.resultado).length;
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ClipboardList aria-hidden="true" className="size-4" /> {c.nome}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {feitos} de {c.itens.length} itens avaliados · aplicado em {formatarDataHora(c.criadoEm)}
                    </p>
                  </div>
                  {STATUS_APLICA_CHECKLIST.includes(a.status) && feitos === 0 && (
                    <BotaoAcao acao={removerChecklist.bind(null, a.id, c.id)} confirmar={`Remover o checklist “${c.nome}” desta auditoria?`} variant="ghost">
                      <Trash2 aria-hidden="true" /> Remover
                    </BotaoAcao>
                  )}
                </CardHeader>
                <CardContent>
                  <Progress value={c.itens.length ? (feitos / c.itens.length) * 100 : 0} aria-label={`Avaliação do checklist ${c.nome}`} className="mb-4" />
                  <ol className="space-y-4">
                    {c.itens.map((i) => (
                      <li key={i.id} className="space-y-2 border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-sm font-medium">
                            {i.ordem}. {i.texto}
                          </p>
                          <SeloResultadoItem resultado={i.resultado} />
                        </div>
                        {i.orientacao && <p className="text-xs text-muted-foreground">{i.orientacao}</p>}
                        {avalia ? (
                          <FormAvaliacaoItem itemId={i.id} resultado={i.resultado} observacao={i.observacao} />
                        ) : (
                          i.observacao && <p className="text-sm whitespace-pre-line text-muted-foreground">{i.observacao}</p>
                        )}
                        <div className="flex flex-wrap items-start gap-4">
                          <div className="min-w-64 flex-1">
                            <Evidencias alvo="item_auditoria" id={i.id} iniciais={i.documentos} rotulo="Evidências do item" bloqueado={finalizada} />
                          </div>
                          {editaAchados && (i.resultado === "NAO_CONFORME" || i.resultado === "PARCIAL") && (
                            <DialogoAchado auditoriaId={a.id} itens={itensChecklist} itemInicial={i.id} />
                          )}
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="achados" className="space-y-6 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {editaAchados
                ? "Achados podem ser registrados e ajustados da execução até a manifestação do gestor."
                : "Achados e recomendações são editáveis da execução até a manifestação do gestor."}
            </p>
            {editaAchados && <DialogoAchado auditoriaId={a.id} itens={itensChecklist} />}
          </div>

          {plano && (
            <Card size="sm">
              <CardContent className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`/planos/${plano.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                    {plano.titulo}
                  </Link>
                  <SeloStatusPlano status={plano.status} />
                </div>
                <Progress value={plano.executado ?? 0} aria-label="Execução do plano da auditoria" />
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {plano.totalAcoes} ação(ões) · {plano.concluidas} concluída(s) · execução {plano.executado === null ? "—" : `${plano.executado}%`}
                  {plano.vencidas > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <SeloVencida /> {plano.vencidas}
                    </span>
                  )}
                </p>
              </CardContent>
            </Card>
          )}

          {a.achados.length === 0 && <p className="text-sm text-muted-foreground">Nenhum achado registrado.</p>}
          {a.achados.map((ach) => (
            <Card key={ach.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <CardTitle className="text-base">
                    Achado {ach.numero} — {ach.titulo}
                  </CardTitle>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <SeloGravidade nivel={ach.nivel} pontuacao={ach.probabilidade * ach.impacto} />
                    {ach.itemChecklist && (
                      <span>
                        Item: {ach.itemChecklist.checklist.nome} · {ach.itemChecklist.texto.slice(0, 80)}
                      </span>
                    )}
                  </div>
                </div>
                {editaAchados && (
                  <div className="flex items-center gap-1">
                    <DialogoAchado
                      auditoriaId={a.id}
                      itens={itensChecklist}
                      achado={{
                        id: ach.id,
                        titulo: ach.titulo,
                        condicao: ach.condicao,
                        criterio: ach.criterio,
                        causa: ach.causa,
                        efeito: ach.efeito,
                        probabilidade: ach.probabilidade,
                        impacto: ach.impacto,
                        itemChecklistId: ach.itemChecklistId,
                      }}
                    />
                    <BotaoAcao acao={excluirAchado.bind(null, a.id, ach.id)} confirmar={`Excluir o achado ${ach.numero}?`} variant="ghost" size="icon-sm" rotulo="Excluir achado">
                      <Trash2 aria-hidden="true" />
                    </BotaoAcao>
                  </div>
                )}
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid gap-4 sm:grid-cols-2">
                  <Campo rotulo="Condição">{ach.condicao}</Campo>
                  <Campo rotulo="Critério">{ach.criterio}</Campo>
                  <Campo rotulo="Causa">{ach.causa}</Campo>
                  <Campo rotulo="Efeito">{ach.efeito}</Campo>
                </dl>
                <Evidencias alvo="achado" id={ach.id} iniciais={ach.documentos} rotulo="Evidências do achado" bloqueado={finalizada} />
                <section aria-label={`Recomendações do achado ${ach.numero}`} className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-medium">Recomendações</h3>
                    {editaAchados && <DialogoRecomendacao achadoId={ach.id} unidades={unidades} />}
                  </div>
                  {ach.recomendacoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma recomendação.</p>}
                  <ul className="space-y-3">
                    {ach.recomendacoes.map((r) => (
                      <li key={r.id} className="space-y-2 border-b pb-3 last:border-0 last:pb-0">
                        <p className="text-sm whitespace-pre-line">
                          <span className="font-medium">
                            {ach.numero}.{r.numero}
                          </span>{" "}
                          {r.texto}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>{r.unidade ? rotuloUnidade(r.unidade) : "Unidade a definir"}</span>
                          {r.prazo && <span>· prazo {formatarDataSimples(r.prazo)}</span>}
                          {r.acao ? (
                            <>
                              <SeloStatusAcao status={r.acao.status} />
                              {plano && (
                                <Link href={`/planos/${plano.id}`} className="text-primary underline-offset-4 hover:underline">
                                  Ver ação no plano ({r.acao.percentual}%)
                                </Link>
                              )}
                            </>
                          ) : (
                            <>
                              {geraAcao && (
                                <BotaoAcao acao={gerarAcaoDaRecomendacao.bind(null, r.id)} confirmar="Gerar a ação 5W2H desta recomendação no plano de ação da auditoria?">
                                  <ListPlus aria-hidden="true" /> Gerar ação
                                </BotaoAcao>
                              )}
                              {editaAchados && (
                                <>
                                  <DialogoRecomendacao
                                    achadoId={ach.id}
                                    unidades={unidades}
                                    recomendacao={{ id: r.id, texto: r.texto, unidadeId: r.unidade?.id ?? null, prazo: r.prazo ? paraCampoData(r.prazo) : null }}
                                  />
                                  <BotaoAcao acao={excluirRecomendacao.bind(null, r.id)} confirmar="Excluir esta recomendação?" variant="ghost" size="icon-sm" rotulo="Excluir recomendação">
                                    <Trash2 aria-hidden="true" />
                                  </BotaoAcao>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="solicitacoes" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Solicitações de auditoria são demandas: a unidade vê só a solicitação, nunca os papéis de trabalho.
            </p>
            {STATUS_SOLICITA.includes(a.status) && (
              <Link href={`/demandas/nova?auditoria=${a.id}`} className={buttonVariants({ size: "lg" })}>
                <Send aria-hidden="true" /> Nova solicitação
              </Link>
            )}
          </div>
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th scope="col" className="px-5 py-2 font-medium">Número</th>
                    <th scope="col" className="px-3 py-2 font-medium">Assunto</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Unidade</th>
                    <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">Prazo</th>
                    <th scope="col" className="px-5 py-2 font-medium">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {a.demandas.map((d) => (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3 font-mono text-xs font-semibold">{numeroDemanda(d.numero, d.ano)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/demandas/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                          {d.assunto}
                        </Link>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">{d.unidadeDestino.sigla ?? d.unidadeDestino.nome}</td>
                      <td className="hidden px-3 py-3 md:table-cell">{formatarDataSimples(d.prazo)}</td>
                      <td className="px-5 py-3">
                        <SituacaoDemanda status={d.status} />
                      </td>
                    </tr>
                  ))}
                  {a.demandas.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                        Nenhuma solicitação enviada.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Papéis de trabalho</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Evidencias alvo="auditoria" id={a.id} iniciais={a.documentos} rotulo="Documentos da auditoria" bloqueado={finalizada} />
              {a.checklists.some((c) => c.itens.some((i) => i.documentos.length)) && (
                <ListaAnexos
                  rotulo="Evidências dos checklists"
                  anexos={a.checklists.flatMap((c) => c.itens.flatMap((i) => i.documentos))}
                />
              )}
              {a.achados.some((ach) => ach.documentos.length) && (
                <ListaAnexos rotulo="Evidências dos achados" anexos={a.achados.flatMap((ach) => ach.documentos)} />
              )}
              <p className="text-xs text-muted-foreground">Visíveis só para a controladoria. As respostas das unidades ficam em cada solicitação.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico" className="pt-4">
          <Card>
            <CardContent>
              {historico.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem registros.</p>
              ) : (
                <ol className="space-y-4 border-l pl-4">
                  {historico.map((h) => {
                    const detalhe = detalheHistorico(h.acao, h.dados);
                    return (
                      <li key={h.id} className="relative text-sm">
                        <span aria-hidden="true" className="absolute top-1.5 -left-[1.3rem] size-2 rounded-full bg-primary" />
                        <p className="font-medium">{HISTORICO[h.acao] ?? h.acao}</p>
                        {detalhe && <p className="text-muted-foreground">{detalhe}</p>}
                        <p className="text-xs text-muted-foreground">
                          {formatarDataHora(h.criadoEm)}
                          {h.usuario ? ` · ${h.usuario}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              )}
              <p className="mt-4 text-xs text-muted-foreground">Registros da trilha de auditoria, que não podem ser alterados.</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
