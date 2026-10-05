"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import type { AcaoView } from "@/lib/dados/planos";
import { validarAcao } from "../actions";

export function FormValidacao({ acao, onConcluido }: { acao: AcaoView; onConcluido: () => void }) {
  const [estado, enviar, pendente] = useActionState(validarAcao, undefined);
  const podeDevolver = acao.status === "AGUARDANDO_VALIDACAO";
  const [decisao, setDecisao] = useState<"aprovar" | "devolver">("aprovar");

  useEffect(() => {
    if (estado?.ok) {
      toast.success(estado.mensagem ?? "Validação registrada.");
      onConcluido();
    } else if (estado?.erro) {
      toast.error(estado.erro);
    }
  }, [estado, onConcluido]);

  return (
    <form action={enviar} className="space-y-4">
      <input type="hidden" name="acaoId" value={acao.id} />
      <p className="rounded-md bg-muted px-3 py-2 text-sm">{acao.oQue}</p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Decisão</legend>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 has-checked:border-sucesso has-checked:bg-sucesso/10 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <input
            type="radio"
            name="decisao"
            value="aprovar"
            checked={decisao === "aprovar"}
            onChange={() => setDecisao("aprovar")}
            className="mt-0.5 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <CircleCheck aria-hidden="true" className="size-4 text-sucesso" /> Aprovar e concluir
            </span>
            <span className="block text-xs text-muted-foreground">A ação passa a “Concluída”, com execução de 100%.</span>
          </span>
        </label>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border p-3 has-checked:border-alerta has-checked:bg-alerta/10 has-disabled:cursor-not-allowed has-disabled:opacity-60 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
          <input
            type="radio"
            name="decisao"
            value="devolver"
            checked={decisao === "devolver"}
            onChange={() => setDecisao("devolver")}
            disabled={!podeDevolver}
            className="mt-0.5 accent-primary"
          />
          <span>
            <span className="flex items-center gap-1.5 font-medium">
              <Undo2 aria-hidden="true" className="size-4 text-alerta" /> Devolver para ajustes
            </span>
            <span className="block text-xs text-muted-foreground">
              {podeDevolver ? "A ação volta a “Em andamento”." : "Disponível apenas para ações aguardando validação."}
            </span>
          </span>
        </label>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="validacao-parecer">
          Parecer{" "}
          <span className="font-normal text-muted-foreground">{decisao === "devolver" ? "(obrigatório)" : "(opcional)"}</span>
        </Label>
        <Textarea id="validacao-parecer" name="parecer" rows={3} required={decisao === "devolver"} />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
          Registrar validação
        </Button>
      </DialogFooter>
    </form>
  );
}
