"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import type { TipoAuditoria } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { TIPO_AUDITORIA } from "@/lib/rotulos";
import { salvarItemModelo, salvarModelo } from "./actions";
import { CLASSE_SELECT } from "../filtros";

function Rodape({ pendente, aoCancelar }: { pendente: boolean; aoCancelar: () => void }) {
  return (
    <DialogFooter>
      <Button type="button" variant="outline" className="h-9" onClick={aoCancelar}>
        Cancelar
      </Button>
      <Button type="submit" disabled={pendente} className="h-9">
        {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
        Salvar
      </Button>
    </DialogFooter>
  );
}

export function DialogoModelo({
  modelo,
}: {
  modelo?: { id: string; nome: string; descricao: string | null; tipo: TipoAuditoria | null };
}) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarModelo, { aoConcluir: () => setAberto(false) });
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {modelo ? (
        <DialogTrigger render={<Button variant="outline" className="h-9" />}>
          <Pencil aria-hidden="true" /> Editar modelo
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button size="lg" />}>
          <Plus aria-hidden="true" /> Novo modelo
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{modelo ? "Editar modelo de checklist" : "Novo modelo de checklist"}</DialogTitle>
          <DialogDescription>Modelos são reutilizados nas auditorias; ao aplicar, os itens são copiados.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          {modelo && <input type="hidden" name="modeloId" value={modelo.id} />}
          <div className="space-y-1.5">
            <Label htmlFor="modelo-nome">
              Nome <span aria-hidden="true">*</span>
            </Label>
            <Input id="modelo-nome" name="nome" required minLength={3} maxLength={200} defaultValue={modelo?.nome} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modelo-tipo">Tipo de auditoria</Label>
            <select id="modelo-tipo" name="tipo" defaultValue={modelo?.tipo ?? ""} className={CLASSE_SELECT}>
              <option value="">Qualquer</option>
              {Object.entries(TIPO_AUDITORIA).map(([valor, rotulo]) => (
                <option key={valor} value={valor}>
                  {rotulo}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="modelo-descricao">Descrição</Label>
            <Textarea id="modelo-descricao" name="descricao" maxLength={2000} rows={3} defaultValue={modelo?.descricao ?? ""} />
          </div>
          <Rodape pendente={pendente} aoCancelar={() => setAberto(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DialogoItemModelo({
  modeloId,
  item,
}: {
  modeloId: string;
  item?: { id: string; texto: string; orientacao: string | null };
}) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarItemModelo, { aoConcluir: () => setAberto(false) });
  const p = item ? `im-${item.id}-` : "im-novo-";
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {item ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar item" title="Editar item" />}>
          <Pencil aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="h-9" />}>
          <Plus aria-hidden="true" /> Novo item
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Editar item" : "Novo item"}</DialogTitle>
          <DialogDescription>Vale para as próximas aplicações do modelo; checklists já aplicados não mudam.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="modeloId" value={modeloId} />
          {item && <input type="hidden" name="itemId" value={item.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}texto`}>
              Item a verificar <span aria-hidden="true">*</span>
            </Label>
            <Textarea id={`${p}texto`} name="texto" required minLength={5} maxLength={2000} rows={3} defaultValue={item?.texto} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${p}orientacao`}>Orientação ou base legal</Label>
            <Textarea id={`${p}orientacao`} name="orientacao" maxLength={2000} rows={2} defaultValue={item?.orientacao ?? ""} />
          </div>
          <Rodape pendente={pendente} aoCancelar={() => setAberto(false)} />
        </form>
      </DialogContent>
    </Dialog>
  );
}
