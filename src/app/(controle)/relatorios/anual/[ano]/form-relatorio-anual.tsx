"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LIMITE_SECAO_ANUAL, SECOES_ANUAL, type SecoesAnual } from "@/lib/relatorios/anual-secoes";
import { salvarRelatorioAnual } from "../actions";

/** Textos editáveis do relatório anual. Campos controlados: o envio não limpa o que foi digitado. */
export function FormRelatorioAnual({ ano, iniciais }: { ano: number; iniciais: SecoesAnual }) {
  const [valores, setValores] = useState<SecoesAnual>(iniciais);
  const [pendente, iniciar] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await salvarRelatorioAnual(undefined, dados);
      if (r?.ok) toast.success(r.mensagem ?? "Textos salvos.");
      else if (r?.erro) toast.error(r.erro);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-busy={pendente}>
      <input type="hidden" name="ano" value={ano} />
      {SECOES_ANUAL.map((s) => (
        <div key={s.chave} className="space-y-1.5">
          <Label htmlFor={s.chave}>{s.titulo}</Label>
          <p id={`${s.chave}-ajuda`} className="text-xs text-muted-foreground">
            {s.ajuda}
          </p>
          <Textarea
            id={s.chave}
            name={s.chave}
            rows={6}
            maxLength={LIMITE_SECAO_ANUAL}
            aria-describedby={`${s.chave}-ajuda`}
            value={valores[s.chave] ?? ""}
            onChange={(e) => setValores((v) => ({ ...v, [s.chave]: e.target.value }))}
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
          Salvar textos
        </Button>
      </div>
    </form>
  );
}
