"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { TipoAuditoria } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { SeloGravidade } from "@/components/alertas/selos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { MESES } from "@/lib/auditorias";
import { classificarRisco, ESCALA, IMPACTO, PROBABILIDADE } from "@/lib/risco";
import { TIPO_AUDITORIA } from "@/lib/rotulos";
import { salvarItemPaai } from "./actions";
import { CLASSE_SELECT } from "../filtros";

type Unidade = { id: string; nome: string; sigla: string | null };
type Item = {
  id: string;
  titulo: string;
  tipo: TipoAuditoria;
  unidadeId: string | null;
  objetivo: string | null;
  probabilidade: number;
  impacto: number;
  mesInicio: number;
  mesFim: number;
};

/** Inclusão ou edição de uma auditoria prevista no PAAI. */
export function DialogoItemPaai({ planoId, unidades, item }: { planoId: string; unidades: Unidade[]; item?: Item }) {
  const [aberto, setAberto] = useState(false);
  const [probabilidade, setProbabilidade] = useState(item?.probabilidade ?? 3);
  const [impacto, setImpacto] = useState(item?.impacto ?? 3);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarItemPaai, { aoConcluir: () => setAberto(false) });
  const p = item ? `i-${item.id}-` : "i-novo-";

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {item ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar auditoria prevista" title="Editar" />}>
          <Pencil aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="h-9" />}>
          <Plus aria-hidden="true" /> Incluir auditoria
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "Editar auditoria prevista" : "Incluir auditoria no PAAI"}</DialogTitle>
          <DialogDescription>A priorização usa a matriz de risco: probabilidade × impacto do objeto auditado.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="planoId" value={planoId} />
          {item && <input type="hidden" name="itemId" value={item.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}titulo`}>
              Objeto da auditoria <span aria-hidden="true">*</span>
            </Label>
            <Input id={`${p}titulo`} name="titulo" required minLength={5} maxLength={200} defaultValue={item?.titulo} className="h-9" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}tipo`}>
                Tipo <span aria-hidden="true">*</span>
              </Label>
              <select id={`${p}tipo`} name="tipo" required defaultValue={item?.tipo ?? ""} className={CLASSE_SELECT}>
                <option value="" disabled>
                  Selecione…
                </option>
                {Object.entries(TIPO_AUDITORIA).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}unidade`}>Unidade auditada</Label>
              <select id={`${p}unidade`} name="unidadeId" defaultValue={item?.unidadeId ?? ""} className={CLASSE_SELECT}>
                <option value="">Entidade inteira</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${p}objetivo`}>Objetivo e justificativa</Label>
            <Textarea id={`${p}objetivo`} name="objetivo" maxLength={5000} rows={3} defaultValue={item?.objetivo ?? ""} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["mesInicio", "mesFim"] as const).map((campo) => (
              <div key={campo} className="space-y-1.5">
                <Label htmlFor={`${p}${campo}`}>{campo === "mesInicio" ? "Início previsto" : "Término previsto"}</Label>
                <select id={`${p}${campo}`} name={campo} defaultValue={item?.[campo] ?? (campo === "mesInicio" ? 1 : 2)} className={CLASSE_SELECT}>
                  {MESES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          <fieldset className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <legend className="mb-2 text-sm font-medium">Risco (probabilidade × impacto)</legend>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}probabilidade`}>Probabilidade</Label>
              <select
                id={`${p}probabilidade`}
                name="probabilidade"
                value={probabilidade}
                onChange={(e) => setProbabilidade(Number(e.target.value))}
                className={CLASSE_SELECT}
              >
                {ESCALA.map((v) => (
                  <option key={v} value={v}>
                    {v} — {PROBABILIDADE[v]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}impacto`}>Impacto</Label>
              <select id={`${p}impacto`} name="impacto" value={impacto} onChange={(e) => setImpacto(Number(e.target.value))} className={CLASSE_SELECT}>
                {ESCALA.map((v) => (
                  <option key={v} value={v}>
                    {v} — {IMPACTO[v]}
                  </option>
                ))}
              </select>
            </div>
            <p className="flex h-9 items-center gap-2 text-sm" aria-live="polite">
              <SeloGravidade nivel={classificarRisco(probabilidade, impacto)} pontuacao={probabilidade * impacto} />
            </p>
          </fieldset>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-9" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente} className="h-9">
              {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
