"use client";

import { useState, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import { ClipboardPlus, Loader2, Save } from "lucide-react";
import type { ResultadoItemChecklist } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RESULTADO_ITEM_CHECKLIST } from "@/lib/rotulos";
import { aplicarChecklist, avaliarItem } from "../actions";
import { CLASSE_SELECT } from "../filtros";

type Modelo = { id: string; nome: string; itens: number; aplicado: boolean };

export function AplicarChecklist({ auditoriaId, modelos }: { auditoriaId: string; modelos: Modelo[] }) {
  const disponiveis = modelos.filter((m) => !m.aplicado);
  const [modeloId, setModeloId] = useState(disponiveis[0]?.id ?? "");
  const [pendente, iniciar] = useTransition();
  if (!disponiveis.length) {
    return <p className="text-sm text-muted-foreground">Todos os modelos ativos já foram aplicados (ou não há modelos com itens).</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-64 flex-1 space-y-1.5">
        <Label htmlFor="modelo-checklist">Aplicar modelo de checklist</Label>
        <select id="modelo-checklist" value={modeloId} onChange={(e) => setModeloId(e.target.value)} className={CLASSE_SELECT}>
          {disponiveis.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome} ({m.itens} {m.itens === 1 ? "item" : "itens"})
            </option>
          ))}
        </select>
      </div>
      <Button
        type="button"
        className="h-9"
        disabled={pendente || !modeloId}
        onClick={() =>
          iniciar(async () => {
            const r = await aplicarChecklist(auditoriaId, modeloId);
            if (r?.erro) toast.error(r.erro);
            else if (r?.ok) {
              toast.success(r.mensagem ?? "Checklist aplicado.");
              setModeloId(disponiveis.find((m) => m.id !== modeloId)?.id ?? "");
            }
          })
        }
      >
        {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ClipboardPlus aria-hidden="true" />}
        Aplicar
      </Button>
    </div>
  );
}

/** Resultado e observação de um item do checklist aplicado. */
export function FormAvaliacaoItem({
  itemId,
  resultado,
  observacao,
}: {
  itemId: string;
  resultado: ResultadoItemChecklist | null;
  observacao: string | null;
}) {
  // Sem reset do formulário: os valores salvos permanecem nos campos.
  const [pendente, iniciar] = useTransition();
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await avaliarItem(undefined, dados);
      if (r?.erro) toast.error(r.erro);
      else if (r?.ok) toast.success(r.mensagem ?? "Item avaliado.");
    });
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-start" aria-busy={pendente}>
      <input type="hidden" name="itemId" value={itemId} />
      <div>
        <Label htmlFor={`resultado-${itemId}`} className="sr-only">
          Resultado
        </Label>
        <select id={`resultado-${itemId}`} name="resultado" defaultValue={resultado ?? ""} className={CLASSE_SELECT}>
          <option value="">Não avaliado</option>
          {Object.entries(RESULTADO_ITEM_CHECKLIST).map(([valor, rotulo]) => (
            <option key={valor} value={valor}>
              {rotulo}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor={`observacao-${itemId}`} className="sr-only">
          Observação
        </Label>
        <Textarea
          id={`observacao-${itemId}`}
          name="observacao"
          rows={1}
          maxLength={5000}
          defaultValue={observacao ?? ""}
          placeholder="Observação (o que foi verificado, amostra, ressalvas)"
          className="min-h-9"
        />
      </div>
      <Button type="submit" variant="outline" className="h-9" disabled={pendente}>
        {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
        Salvar
      </Button>
    </form>
  );
}
