"use client";

import { useState } from "react";
import { ArrowRightLeft, Loader2, Pencil } from "lucide-react";
import type { StatusAuditoria } from "@/generated/prisma/browser";
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
import { ETAPAS_AUDITORIA, TRANSICOES_AUDITORIA } from "@/lib/auditorias";
import { STATUS_AUDITORIA } from "@/lib/rotulos";
import { alterarStatusAuditoria } from "../actions";
import { CLASSE_SELECT } from "../filtros";
import { FormAuditoria, type ValoresAuditoria } from "../form-auditoria";

type Unidade = { id: string; nome: string; sigla: string | null };
type Membro = { id: string; nome: string };

export function DialogoEditarAuditoria({
  unidades,
  membros,
  valores,
}: {
  unidades: Unidade[];
  membros: Membro[];
  valores: ValoresAuditoria;
}) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" className="h-9" />}>
        <Pencil aria-hidden="true" /> Editar planejamento
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Editar planejamento</DialogTitle>
          <DialogDescription>Dados, alcance e equipe. As alterações ficam registradas no histórico.</DialogDescription>
        </DialogHeader>
        <FormAuditoria unidades={unidades} membros={membros} iniciais={valores} aoConcluir={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function DialogoStatusAuditoria({
  auditoriaId,
  status,
  podeEncerrar,
}: {
  auditoriaId: string;
  status: StatusAuditoria;
  podeEncerrar: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const opcoes = TRANSICOES_AUDITORIA[status].filter((s) => podeEncerrar || (s !== "CANCELADA" && s !== "ENCERRADA"));
  const [novo, setNovo] = useState<StatusAuditoria>(opcoes[0] ?? status);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(alterarStatusAuditoria, { aoConcluir: () => setAberto(false) });
  const cancelando = novo === "CANCELADA";
  const voltando = ETAPAS_AUDITORIA.indexOf(novo) >= 0 && ETAPAS_AUDITORIA.indexOf(novo) < ETAPAS_AUDITORIA.indexOf(status);

  if (opcoes.length === 0) return null;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-9" />}>
        <ArrowRightLeft aria-hidden="true" /> Mudar etapa
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mudar etapa da auditoria</DialogTitle>
          <DialogDescription>
            Atual: {STATUS_AUDITORIA[status]}. A auditoria avança uma etapa por vez e pode voltar uma etapa antes do relatório final.
          </DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="auditoriaId" value={auditoriaId} />
          <div className="space-y-1.5">
            <Label htmlFor="novo-status">Nova etapa</Label>
            <select
              id="novo-status"
              name="status"
              value={novo}
              onChange={(e) => setNovo(e.target.value as StatusAuditoria)}
              className={CLASSE_SELECT}
            >
              {opcoes.map((s) => (
                <option key={s} value={s}>
                  {STATUS_AUDITORIA[s]}
                  {ETAPAS_AUDITORIA.indexOf(s) >= 0 && ETAPAS_AUDITORIA.indexOf(s) < ETAPAS_AUDITORIA.indexOf(status) ? " (voltar)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="justificativa">
              {cancelando ? "Justificativa" : "Observação"}
              {cancelando ? <span aria-hidden="true"> *</span> : " (opcional)"}
            </Label>
            <Textarea
              id="justificativa"
              name="justificativa"
              rows={4}
              required={cancelando}
              minLength={cancelando ? 10 : undefined}
              maxLength={5000}
              placeholder={cancelando ? "Por que a auditoria está sendo cancelada." : voltando ? "Por que a auditoria volta de etapa." : undefined}
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
