import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList, EyeOff, History, Paperclip } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { carregarSituacao, numeroSituacao } from "@/lib/dados/medidas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Evidencias } from "@/components/anexos/evidencias";
import { SeloGravidade, SeloStatusSituacao } from "@/components/medidas/selos";
import { SeloStatusPlano, SeloVencida } from "@/components/selos-status";
import { formatarDataHora } from "@/lib/datas";
import { IMPACTO, PROBABILIDADE } from "@/lib/risco";
import { ORIGEM_SITUACAO, STATUS_SITUACAO } from "@/lib/rotulos";
import { STATUS_ENCERRADOS } from "../filtros";
import { BotaoCriarPlano, DialogoEditarSituacao, DialogoStatusSituacao } from "./acoes-situacao";

export const metadata: Metadata = { title: "Situação" };

const HISTORICO: Record<string, string> = {
  "situacao.criada": "Registrou a situação",
  "situacao.atualizada": "Editou a situação",
  "situacao.status_alterado": "Mudou a situação",
  "situacao.encerrada": "Encerrou a situação",
  "situacao.reaberta": "Reabriu a situação",
  "plano.criado": "Criou o plano de ação",
  "documento.enviado": "Anexou documento",
};

function detalheHistorico(acao: string, dados: unknown): string | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as Record<string, unknown>;
  const status = (v: unknown) => STATUS_SITUACAO[v as keyof typeof STATUS_SITUACAO] ?? String(v);
  if (acao === "documento.enviado" && typeof d.nome === "string") return d.nome;
  if (acao.startsWith("situacao.") && d.de && d.para && typeof d.de === "string") {
    return [`${status(d.de)} → ${status(d.para)}`, typeof d.justificativa === "string" ? d.justificativa : null, typeof d.motivo === "string" ? d.motivo : null]
      .filter(Boolean)
      .join(" · ");
  }
  if (acao === "situacao.atualizada") {
    const campos: Record<string, string> = {
      titulo: "título",
      origem: "origem",
      unidadeId: "unidade",
      probabilidade: "probabilidade",
      impacto: "impacto",
      sigilosa: "sigilo",
      descricaoAlterada: "descrição",
      denuncianteAlterado: "denunciante",
    };
    const alterados = Object.keys(d).filter((k) => k in campos).map((k) => campos[k]);
    return alterados.length ? `Alterou: ${alterados.join(", ")}` : null;
  }
  return null;
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default async function DetalheSituacao({ params }: PageProps<"/medidas/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = await carregarSituacao(ctx, (await params).id);
  if (!dados) notFound();
  const { situacao: s, plano, unidades, historico } = dados;
  const encerrada = STATUS_ENCERRADOS.includes(s.status);
  const numero = numeroSituacao(s.numero, s.ano);

  return (
    <>
      <Link href="/medidas" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Medidas
      </Link>
      <CabecalhoPagina
        titulo={s.titulo}
        descricao={[
          `Situação ${numero}`,
          `registrada em ${formatarDataHora(s.criadoEm)}${s.criadoPor ? ` por ${s.criadoPor}` : ""}`,
        ].join(" · ")}
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            {!encerrada && (
              <DialogoEditarSituacao
                unidades={unidades}
                valores={{
                  id: s.id,
                  titulo: s.titulo,
                  descricao: s.descricao,
                  origem: s.origem,
                  unidadeId: s.unidadeId,
                  probabilidade: s.probabilidade,
                  impacto: s.impacto,
                  sigilosa: s.sigilosa,
                  denunciante: s.denunciante,
                  denuncianteOculto: s.sigilosa && ctx.perfil !== "CONTROLADOR",
                }}
              />
            )}
            <DialogoStatusSituacao key={s.status} situacaoId={s.id} status={s.status} podeEncerrar={ctx.perfil === "CONTROLADOR"} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-5">
              <div className="flex flex-wrap items-center gap-2">
                <SeloStatusSituacao status={s.status} />
                <SeloGravidade nivel={s.nivel} pontuacao={s.probabilidade * s.impacto} />
              </div>
              <p className="text-sm whitespace-pre-line">{s.descricao}</p>
              <dl className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Origem">{ORIGEM_SITUACAO[s.origem]}</Campo>
                <Campo rotulo="Unidade envolvida">{s.unidade ? (s.unidade.sigla ? `${s.unidade.sigla} — ${s.unidade.nome}` : s.unidade.nome) : "—"}</Campo>
                <Campo rotulo="Probabilidade">
                  {s.probabilidade} — {PROBABILIDADE[s.probabilidade]}
                </Campo>
                <Campo rotulo="Impacto">
                  {s.impacto} — {IMPACTO[s.impacto]}
                </Campo>
                {s.origem === "DENUNCIA" && (
                  <Campo rotulo={s.sigilosa ? "Denunciante (denúncia sigilosa)" : "Denunciante"}>
                    {s.denuncianteOculto ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <EyeOff aria-hidden="true" className="size-3.5" /> Identidade preservada; visível só ao controlador
                      </span>
                    ) : (
                      (s.denunciante ?? <span className="text-muted-foreground">Não informado</span>)
                    )}
                  </Campo>
                )}
              </dl>
              {encerrada && s.encerradoEm && (
                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">
                    {STATUS_SITUACAO[s.status]} em {formatarDataHora(s.encerradoEm)}
                    {s.encerradoPor ? ` por ${s.encerradoPor}` : ""}
                  </p>
                  {s.justificativaEncerramento && <p className="mt-1 whitespace-pre-line text-muted-foreground">{s.justificativaEncerramento}</p>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList aria-hidden="true" className="size-4" /> Plano de ação
              </CardTitle>
            </CardHeader>
            <CardContent>
              {plano ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/planos/${plano.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
                      {plano.titulo}
                    </Link>
                    <SeloStatusPlano status={plano.status} />
                  </div>
                  <Progress value={plano.executado ?? 0} aria-label="Execução do plano" />
                  <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>
                      {plano.totalAcoes} {plano.totalAcoes === 1 ? "ação" : "ações"} · {plano.concluidas} concluída(s) · execução{" "}
                      {plano.executado === null ? "—" : `${plano.executado}%`}
                    </span>
                    {plano.vencidas > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <SeloVencida /> {plano.vencidas}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Cada ação pode ser enviada à unidade responsável como demanda pelo botão “Enviar como demanda” do plano.
                  </p>
                </div>
              ) : encerrada ? (
                <p className="text-sm text-muted-foreground">Situação encerrada sem plano de ação.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Crie o plano de ação geral (5W2H) para tratar a situação. As ações podem ser enviadas aos envolvidos como demandas.
                  </p>
                  <BotaoCriarPlano situacaoId={s.id} />
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Paperclip aria-hidden="true" className="size-4" /> Anexos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Evidencias alvo="situacao" id={s.id} iniciais={s.documentos} rotulo="Anexos da situação" bloqueado={encerrada} />
              {!encerrada && s.documentos.length === 0 && <p className="mt-2 text-xs text-muted-foreground">Nenhum anexo ainda.</p>}
            </CardContent>
          </Card>
        </div>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History aria-hidden="true" className="size-4" /> Histórico
            </CardTitle>
          </CardHeader>
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
      </div>
    </>
  );
}
