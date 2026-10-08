"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE_SECAO_ANUAL, SECOES_ANUAL, type ChaveSecaoAnual } from "@/lib/relatorios/anual-secoes";
import { VARIAVEIS_ANUAL } from "@/lib/relatorios/anual-padrao";
import { cn } from "@/lib/utils";
import { salvarModeloAnual, salvarRelatorioAnual } from "../actions";

type Textos = Record<ChaveSecaoAnual, string>;

const igual = (a: string, b: string) => a.replace(/\r\n/g, "\n").trim() === b.replace(/\r\n/g, "\n").trim();

/**
 * Textos editáveis do relatório anual, no texto padrão (modo "padrao") ou num exercício (modo "ano").
 * Cada seção mostra se segue a referência (texto padrão / texto-base) e permite restaurá-la.
 * Campos controlados: o envio não limpa o que foi digitado.
 */
export function FormRelatorioAnual({
  modo,
  ano,
  iniciais,
  referencia,
}: {
  modo: "ano" | "padrao";
  ano?: number;
  /** Texto atual de cada seção (já resolvido: personalizado ou herdado). */
  iniciais: Textos;
  /** Texto para o qual "Restaurar" volta: o padrão (modo ano) ou o texto-base do sistema (modo padrão). */
  referencia: Textos;
}) {
  const [valores, setValores] = useState<Textos>(iniciais);
  const [pendente, iniciar] = useTransition();
  const nomeReferencia = modo === "ano" ? "texto padrão" : "texto-base do sistema";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = modo === "ano" ? await salvarRelatorioAnual(undefined, dados) : await salvarModeloAnual(undefined, dados);
      if (r?.ok) toast.success(r.mensagem ?? "Textos salvos.");
      else if (r?.erro) toast.error(r.erro);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-busy={pendente}>
      {ano !== undefined && <input type="hidden" name="ano" value={ano} />}
      <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Variáveis substituídas no PDF:{" "}
        {VARIAVEIS_ANUAL.map((v, i) => (
          <span key={v.chave}>
            {i > 0 && " · "}
            <code className="font-mono text-foreground">{`{${v.chave}}`}</code> {v.descricao}
          </span>
        ))}
        .
      </p>
      {SECOES_ANUAL.map((s) => {
        const segue = igual(valores[s.chave] ?? "", referencia[s.chave]);
        return (
          <div key={s.chave} className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label htmlFor={s.chave}>{s.titulo}</Label>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
                    segue ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                  )}
                >
                  {segue
                    ? modo === "ano"
                      ? "Segue o texto padrão"
                      : "Texto-base do sistema"
                    : modo === "ano"
                      ? `Personalizado para ${ano}`
                      : "Personalizado"}
                </span>
                {!segue && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setValores((v) => ({ ...v, [s.chave]: referencia[s.chave] }))}
                  >
                    <RotateCcw aria-hidden="true" /> Restaurar {nomeReferencia}
                  </Button>
                )}
              </span>
            </div>
            <p id={`${s.chave}-ajuda`} className="text-xs text-muted-foreground">
              {s.ajuda}
            </p>
            <Textarea
              id={s.chave}
              name={s.chave}
              rows={7}
              maxLength={LIMITE_SECAO_ANUAL}
              aria-describedby={`${s.chave}-ajuda`}
              value={valores[s.chave] ?? ""}
              onChange={(e) => setValores((v) => ({ ...v, [s.chave]: e.target.value }))}
            />
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
          {modo === "ano" ? `Salvar textos de ${ano}` : "Salvar texto padrão"}
        </Button>
      </div>
    </form>
  );
}
