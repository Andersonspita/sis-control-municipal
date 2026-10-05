"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, ListPlus, Loader2, Pencil } from "lucide-react";
import type { StatusSituacao } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { STATUS_SITUACAO } from "@/lib/rotulos";
import { alterarStatusSituacao, criarPlanoDaSituacao } from "../actions";
import { CLASSE_SELECT, STATUS_ENCERRADOS } from "../filtros";
import { FormSituacao, type ValoresSituacao } from "../form-situacao";

type Unidade = { id: string; nome: string; sigla: string | null };

export function DialogoEditarSituacao({ unidades, valores }: { unidades: Unidade[]; valores: ValoresSituacao }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" className="h-9" />}>
        <Pencil aria-hidden="true" /> Editar
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar situação</DialogTitle>
          <DialogDescription>As alterações ficam registradas no histórico.</DialogDescription>
        </DialogHeader>
        <FormSituacao unidades={unidades} iniciais={valores} aoConcluir={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function DialogoStatusSituacao({
  situacaoId,
  status,
  podeEncerrar,
}: {
  situacaoId: string;
  status: StatusSituacao;
  podeEncerrar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const encerrada = STATUS_ENCERRADOS.includes(status);
  const opcoes = (Object.keys(STATUS_SITUACAO) as StatusSituacao[]).filter(
    (s) => s !== status && (podeEncerrar || (!encerrada && !STATUS_ENCERRADOS.includes(s))),
  );
  const [novo, setNovo] = useState<StatusSituacao | "">("");
  const { pendente, formRef, onSubmit } = useAcaoFormulario(alterarStatusSituacao, { aoConcluir: () => setAberto(false) });
  const exigeJustificativa = novo !== "" && STATUS_ENCERRADOS.includes(novo);

  if (opcoes.length === 0) return null;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setNovo("");
      }}
    >
      <DialogTrigger render={<Button className="h-9" />}>
        <ArrowRightLeft aria-hidden="true" /> {encerrada ? "Reabrir" : "Mudar situação"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{encerrada ? "Reabrir situação" : "Mudar situação"}</DialogTitle>
          <DialogDescription>
            Atual: {STATUS_SITUACAO[status]}. Para resolver ou arquivar é preciso justificar.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="situacaoId" value={situacaoId} />
          <div className="space-y-1.5">
            <Label htmlFor="novo-status">Nova situação</Label>
            <select
              id="novo-status"
              name="status"
              value={novo}
              onChange={(e) => setNovo(e.target.value as StatusSituacao)}
              required
              className={CLASSE_SELECT}
            >
              <option value="" disabled>
                Selecione…
              </option>
              {opcoes.map((s) => (
                <option key={s} value={s}>
                  {STATUS_SITUACAO[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="justificativa">
              Justificativa{exigeJustificativa ? <span aria-hidden="true"> *</span> : " (opcional)"}
            </Label>
            <Textarea
              id="justificativa"
              name="justificativa"
              rows={4}
              required={exigeJustificativa}
              minLength={exigeJustificativa ? 10 : undefined}
              maxLength={5000}
              placeholder={exigeJustificativa ? "Como a situação foi resolvida ou por que está sendo arquivada." : undefined}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-9" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente} className="h-9">
              {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function BotaoCriarPlano({ situacaoId }: { situacaoId: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      type="button"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await criarPlanoDaSituacao(situacaoId);
          if (r?.erro) toast.error(r.erro);
        })
      }
    >
      {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <ListPlus aria-hidden="true" />}
      Criar plano de ação
    </Button>
  );
}
