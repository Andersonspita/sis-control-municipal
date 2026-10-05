"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, Loader2, Pencil, Quote, Sparkles, X } from "lucide-react";
import type { SituacaoRequisito, StatusSugestaoIA } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeloSituacao } from "@/components/selos-status";
import { EXIGE_JUSTIFICATIVA } from "@/lib/dados/conformidade";
import { RESPOSTA_REQUISITO } from "@/lib/rotulos";
import { localCitacao } from "@/lib/ia/citacoes";
import type { SugestaoView } from "@/lib/ia/dados";
import { aceitarSugestaoIA, rejeitarSugestaoIA } from "@/app/(controle)/ia/actions";

const OPCOES = Object.keys(RESPOSTA_REQUISITO) as Exclude<SituacaoRequisito, "NAO_AVALIADO">[];

const STATUS: Record<StatusSugestaoIA, string> = {
  PENDENTE_REVISAO: "Pendente de revisão",
  ACEITA: "Aceita",
  EDITADA: "Aceita com edição",
  REJEITADA: "Rejeitada",
};

const COMPROVA: Record<string, string> = { SIM: "Comprova", PARCIALMENTE: "Comprova em parte", NAO: "Não comprova" };

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" });

export function CartaoSugestao({ sugestao }: { sugestao: SugestaoView }) {
  const idBase = useId();
  const { conteudo, resposta } = sugestao;
  const [modo, setModo] = useState<"ver" | "editar" | "rejeitar">("ver");
  const [situacao, setSituacao] = useState<SituacaoRequisito>(conteudo.situacao);
  const [justificativa, setJustificativa] = useState(
    conteudo.faltantes.length ? `${conteudo.justificativa}\nFalta comprovar: ${conteudo.faltantes.join("; ")}.` : conteudo.justificativa,
  );
  const [evidencia, setEvidencia] = useState(conteudo.evidencia ?? "");
  const [motivo, setMotivo] = useState("");
  const [pendente, iniciar] = useTransition();
  const pendenteRevisao = sugestao.status === "PENDENTE_REVISAO";
  const cicloAberto = resposta?.ciclo.status === "EM_ANDAMENTO";

  function executar(acao: () => Promise<{ ok: true; mensagem: string } | { ok: false; erro: string }>) {
    iniciar(async () => {
      const r = await acao();
      if (r.ok) {
        toast.success(r.mensagem);
        setModo("ver");
      } else toast.error(r.erro);
    });
  }

  return (
    <article id={`sug-${sugestao.id}`} aria-labelledby={`${idBase}-titulo`} className="scroll-mt-24 rounded-xl border bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 space-y-1">
          <h3 id={`${idBase}-titulo`} className="font-medium leading-snug">
            {resposta ? (
              <>
                <span className="mr-2 font-mono text-xs font-semibold text-muted-foreground">{resposta.requisito.codigo}</span>
                {resposta.requisito.titulo}
              </>
            ) : (
              "Requisito removido"
            )}
          </h3>
          <p className="text-xs text-muted-foreground">
            {sugestao.tipo === "AVALIAR_EVIDENCIA" ? "Avaliação de evidência" : "Documento comparado com a norma"}
            {resposta && (
              <>
                {" · "}
                <Link href={`/autoavaliacao/${resposta.ciclo.id}#req-${resposta.id}`} className="underline-offset-4 hover:underline">
                  {resposta.ciclo.nome} · {resposta.ciclo.norma}
                </Link>
              </>
            )}
            {" · "}
            {data.format(sugestao.criadoEm)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          <Sparkles aria-hidden="true" className="size-3" /> {STATUS[sugestao.status]}
        </span>
      </header>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        {resposta && (
          <>
            <span className="text-muted-foreground">Atual:</span>
            <SeloSituacao situacao={resposta.situacao} />
            <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
          </>
        )}
        <span className="text-muted-foreground">Sugerida:</span>
        <SeloSituacao situacao={conteudo.situacao} />
        {conteudo.comprova && <span className="text-xs font-medium text-muted-foreground">· {COMPROVA[conteudo.comprova]}</span>}
      </div>

      <p className="mt-3 max-w-4xl text-sm leading-relaxed whitespace-pre-line">{conteudo.justificativa}</p>
      {conteudo.faltantes.length > 0 && (
        <div className="mt-2 text-sm">
          <p className="font-medium">O que falta comprovar</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
            {conteudo.faltantes.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 space-y-2">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Citações conferidas no documento</p>
        {sugestao.citacoes.length === 0 && (
          <p className="text-sm text-muted-foreground">Sem citação: a conclusão é de que os documentos não tratam do requisito.</p>
        )}
        {sugestao.citacoes.map((c, i) => (
          <figure key={i} className="flex gap-2 rounded-lg border-l-2 border-primary/40 bg-muted/30 px-3 py-2 text-sm">
            <Quote aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <div className="min-w-0">
              <blockquote>
                <mark className="rounded bg-alerta/20 px-0.5 text-foreground">{c.texto}</mark>
              </blockquote>
              <figcaption className="mt-1 text-xs text-muted-foreground">
                <Link href={`/documentos/${c.documentoId}`} className="underline-offset-4 hover:underline">
                  {localCitacao(c)}
                </Link>
              </figcaption>
            </div>
          </figure>
        ))}
        {sugestao.citacoesDescartadas > 0 && (
          <p className="text-xs text-muted-foreground">
            {sugestao.citacoesDescartadas} citação(ões) do modelo descartada(s) por não existirem literalmente no documento.
          </p>
        )}
      </div>

      {!pendenteRevisao && (
        <p className="mt-3 text-xs text-muted-foreground">
          {STATUS[sugestao.status]}
          {sugestao.revisadoPor && ` por ${sugestao.revisadoPor}`}
          {sugestao.revisadoEm && ` em ${data.format(sugestao.revisadoEm)}`}
          {sugestao.motivoRejeicao && `. Motivo: ${sugestao.motivoRejeicao}`}
        </p>
      )}

      {pendenteRevisao && resposta && !cicloAberto && (
        <p className="mt-3 text-sm text-muted-foreground">Ciclo encerrado: a sugestão não pode mais ser aplicada.</p>
      )}

      {pendenteRevisao && modo === "editar" && (
        <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-3">
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium">Situação</legend>
            <div className="flex flex-wrap gap-2">
              {OPCOES.map((op) => (
                <label key={op} className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm has-checked:border-primary has-checked:bg-primary/10">
                  <input type="radio" name={`${idBase}-sit`} value={op} checked={situacao === op} onChange={() => setSituacao(op)} className="sr-only" />
                  {RESPOSTA_REQUISITO[op]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-just`}>
              Justificativa{EXIGE_JUSTIFICATIVA.includes(situacao) ? " (obrigatória)" : ""}
            </Label>
            <Textarea id={`${idBase}-just`} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} rows={4} maxLength={4000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-evid`}>Evidência</Label>
            <Textarea id={`${idBase}-evid`} value={evidencia} onChange={(e) => setEvidencia(e.target.value)} rows={3} maxLength={4000} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={pendente}
              onClick={() => executar(() => aceitarSugestaoIA(sugestao.id, { situacao: situacao as (typeof OPCOES)[number], justificativa, evidencia }))}
            >
              {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />} Aplicar edição
            </Button>
            <Button variant="ghost" onClick={() => setModo("ver")} disabled={pendente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {pendenteRevisao && modo === "rejeitar" && (
        <div className="mt-4 space-y-3 rounded-lg border bg-muted/20 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${idBase}-motivo`}>Motivo da rejeição (opcional)</Label>
            <Textarea id={`${idBase}-motivo`} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={1000} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={pendente} onClick={() => executar(() => rejeitarSugestaoIA(sugestao.id, motivo))}>
              {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <X aria-hidden="true" />} Confirmar rejeição
            </Button>
            <Button variant="ghost" onClick={() => setModo("ver")} disabled={pendente}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {pendenteRevisao && modo === "ver" && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button disabled={pendente || !cicloAberto} onClick={() => executar(() => aceitarSugestaoIA(sugestao.id))}>
            {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Check aria-hidden="true" />} Aceitar
          </Button>
          <Button variant="outline" disabled={pendente || !cicloAberto} onClick={() => setModo("editar")}>
            <Pencil aria-hidden="true" /> Editar
          </Button>
          <Button variant="ghost" disabled={pendente} onClick={() => setModo("rejeitar")}>
            <X aria-hidden="true" /> Rejeitar
          </Button>
        </div>
      )}
    </article>
  );
}
