"use client";

import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleAlert, CircleCheck, Loader2, Save, Undo2 } from "lucide-react";
import type { SituacaoRequisito } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SeloSituacao, VISUAL_SITUACAO, type Tom } from "@/components/selos-status";
import { EXIGE_JUSTIFICATIVA, validarResposta } from "@/lib/dados/conformidade";
import type { NoRequisito, RespostaView } from "@/lib/dados/autoavaliacao";
import { RESPOSTA_REQUISITO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { salvarResposta } from "../actions";

const OPCOES = Object.keys(RESPOSTA_REQUISITO) as Exclude<SituacaoRequisito, "NAO_AVALIADO">[];

const MARCADO: Record<Tom, string> = {
  sucesso: "has-checked:border-sucesso has-checked:bg-sucesso/12 has-checked:text-sucesso",
  alerta: "has-checked:border-alerta has-checked:bg-alerta/15 has-checked:text-alerta",
  perigo: "has-checked:border-perigo has-checked:bg-perigo/12 has-checked:text-perigo",
  info: "has-checked:border-info has-checked:bg-info/12 has-checked:text-info",
  neutro: "has-checked:border-foreground/40 has-checked:bg-muted",
  primario: "has-checked:border-primary has-checked:bg-primary/10 has-checked:text-primary",
};

const horario = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" });

export function CartaoRequisito({
  no,
  resposta,
  bloqueado,
  onSalvo,
}: {
  no: NoRequisito;
  resposta: RespostaView;
  bloqueado: boolean;
  onSalvo: (r: RespostaView) => void;
}) {
  const idBase = useId();
  const [situacao, setSituacao] = useState<SituacaoRequisito>(resposta.situacao);
  const [observacao, setObservacao] = useState(resposta.observacao ?? "");
  const [evidencia, setEvidencia] = useState(resposta.evidencia ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const alterado =
    situacao !== resposta.situacao ||
    observacao.trim() !== (resposta.observacao ?? "") ||
    evidencia.trim() !== (resposta.evidencia ?? "");
  const exigeJustificativa = EXIGE_JUSTIFICATIVA.includes(situacao);

  function salvar() {
    if (bloqueado || !alterado || salvando) return;
    const problema = validarResposta(situacao, observacao);
    if (problema) {
      setErro(problema);
      document.getElementById(`${idBase}-obs`)?.focus();
      return;
    }
    setErro(null);
    iniciar(async () => {
      const r = await salvarResposta({ respostaId: resposta.id, situacao, observacao, evidencia });
      if (!r.ok) {
        setErro(r.erro);
        toast.error(r.erro);
        return;
      }
      onSalvo({
        ...resposta,
        situacao,
        observacao: observacao.trim() || null,
        evidencia: evidencia.trim() || null,
        respondidoEm: r.respondidoEm,
        respondidoPor: r.respondidoPor,
      });
    });
  }

  function desfazer() {
    setSituacao(resposta.situacao);
    setObservacao(resposta.observacao ?? "");
    setEvidencia(resposta.evidencia ?? "");
    setErro(null);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      salvar();
      return;
    }
    const alvo = e.target as HTMLElement;
    if (bloqueado || e.ctrlKey || e.metaKey || e.altKey || alvo.tagName === "TEXTAREA") return;
    const indice = ["1", "2", "3", "4"].indexOf(e.key);
    if (indice >= 0) {
      e.preventDefault();
      setSituacao(OPCOES[indice]);
    }
  }

  return (
    <article
      id={`req-${no.id}`}
      aria-labelledby={`${idBase}-titulo`}
      onKeyDown={aoTeclar}
      className={cn(
        "scroll-mt-24 rounded-xl border bg-card p-4 sm:p-5",
        alterado && !bloqueado && "border-primary/50 ring-1 ring-primary/20",
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 id={`${idBase}-titulo`} className="min-w-0 flex-1 font-medium leading-snug">
          <span className="mr-2 font-mono text-xs font-semibold text-muted-foreground">{no.codigo}</span>
          {no.titulo}
        </h3>
        <SeloSituacao situacao={resposta.situacao} />
      </header>

      {no.descricao && (
        <blockquote className="mt-3 max-w-4xl border-l-2 border-primary/30 pl-3 text-sm leading-relaxed text-muted-foreground">
          {no.descricao}
        </blockquote>
      )}
      {(no.orientacao || no.fundamento) && (
        <dl className="mt-3 space-y-1.5 text-xs">
          {no.orientacao && (
            <div className="max-w-4xl rounded-md bg-accent px-3 py-2 text-accent-foreground">
              <dt className="font-semibold">Evidências esperadas e orientação</dt>
              <dd>{no.orientacao}</dd>
            </div>
          )}
          {no.fundamento && (
            <div className="flex gap-1 text-muted-foreground">
              <dt className="font-medium">Fundamento:</dt>
              <dd>{no.fundamento}</dd>
            </div>
          )}
        </dl>
      )}

      <fieldset className="mt-4" disabled={bloqueado}>
        <legend className="mb-2 text-sm font-medium">
          Avaliação <span className="sr-only">do requisito {no.codigo}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {OPCOES.map((op, i) => {
            const v = VISUAL_SITUACAO[op];
            const Icone = v.icone;
            return (
              <label
                key={op}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors select-none hover:bg-muted/60 has-checked:font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed has-disabled:opacity-70",
                  MARCADO[v.tom],
                )}
              >
                <input
                  type="radio"
                  className="sr-only"
                  name={`${idBase}-situacao`}
                  value={op}
                  checked={situacao === op}
                  onChange={() => setSituacao(op)}
                />
                <Icone aria-hidden="true" className="size-4" />
                {RESPOSTA_REQUISITO[op]}
                <kbd aria-hidden="true" className="ml-1 hidden rounded border px-1 font-mono text-[0.65rem] text-muted-foreground sm:inline">
                  {i + 1}
                </kbd>
              </label>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`${idBase}-obs`} className="text-sm font-medium">
              Justificativa{" "}
              <span className="font-normal text-muted-foreground">{exigeJustificativa ? "(obrigatória)" : "(opcional)"}</span>
            </label>
            <Textarea
              id={`${idBase}-obs`}
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              aria-required={exigeJustificativa}
              aria-invalid={!!erro && exigeJustificativa && !observacao.trim()}
              aria-describedby={erro ? `${idBase}-erro` : undefined}
              maxLength={4000}
              rows={3}
              placeholder={exigeJustificativa ? "Explique o motivo da avaliação." : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${idBase}-evi`} className="text-sm font-medium">
              Evidência <span className="font-normal text-muted-foreground">(descrição)</span>
            </label>
            <Textarea
              id={`${idBase}-evi`}
              value={evidencia}
              onChange={(e) => setEvidencia(e.target.value)}
              maxLength={4000}
              rows={3}
              placeholder="Atos, documentos, links ou locais que comprovam o atendimento."
            />
            {/* TODO(anexos): incluir o componente de anexos (Documento.respostaRequisitoId) quando disponível. */}
          </div>
        </div>
      </fieldset>

      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {erro ? (
            <span id={`${idBase}-erro`} className="flex items-center gap-1.5 text-perigo">
              <CircleAlert aria-hidden="true" className="size-3.5" /> {erro}
            </span>
          ) : salvando ? (
            <>
              <Loader2 aria-hidden="true" className="size-3.5 animate-spin" /> Salvando…
            </>
          ) : alterado && !bloqueado ? (
            <>
              <CircleAlert aria-hidden="true" className="size-3.5 text-alerta" /> Alterações não salvas
            </>
          ) : resposta.respondidoEm ? (
            <>
              <CircleCheck aria-hidden="true" className="size-3.5 text-sucesso" />
              Salvo em {horario.format(new Date(resposta.respondidoEm))}
              {resposta.respondidoPor && ` por ${resposta.respondidoPor}`}
            </>
          ) : (
            "Ainda não avaliado"
          )}
        </p>
        {!bloqueado && (
          <div className="flex gap-2">
            {alterado && (
              <Button type="button" variant="ghost" size="sm" onClick={desfazer} disabled={salvando}>
                <Undo2 aria-hidden="true" /> Desfazer
              </Button>
            )}
            <Button type="button" size="sm" onClick={salvar} disabled={!alterado || salvando}>
              {salvando ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
              Salvar
            </Button>
          </div>
        )}
      </footer>
    </article>
  );
}
