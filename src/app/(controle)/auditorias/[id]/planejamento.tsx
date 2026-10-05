"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { salvarQuestao } from "../actions";

type Questao = { id: string; questao: string; informacoes: string | null; fontes: string | null; procedimentos: string | null };

const CAMPOS = [
  { nome: "informacoes", rotulo: "Informações requeridas", dica: "Dados e documentos necessários para responder à questão." },
  { nome: "fontes", rotulo: "Fontes de informação", dica: "Sistemas, setores, processos e pessoas." },
  { nome: "procedimentos", rotulo: "Procedimentos", dica: "Exame documental, entrevista, inspeção, conferência, amostragem…" },
] as const;

/** Inclusão ou edição de uma linha da matriz de planejamento. */
export function DialogoQuestao({ auditoriaId, questao }: { auditoriaId: string; questao?: Questao }) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarQuestao, { aoConcluir: () => setAberto(false) });
  const p = questao ? `q-${questao.id}-` : "q-nova-";
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {questao ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar questão" title="Editar questão" />}>
          <Pencil aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus aria-hidden="true" /> Nova questão
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{questao ? "Editar questão de auditoria" : "Nova questão de auditoria"}</DialogTitle>
          <DialogDescription>Cada questão da matriz orienta o que será examinado na execução.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="auditoriaId" value={auditoriaId} />
          {questao && <input type="hidden" name="questaoId" value={questao.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}questao`}>
              Questão <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={`${p}questao`}
              name="questao"
              required
              minLength={5}
              maxLength={2000}
              rows={2}
              defaultValue={questao?.questao}
              placeholder="Ex.: As dispensas por valor respeitam os limites e a pesquisa de preços?"
            />
          </div>
          {CAMPOS.map((c) => (
            <div key={c.nome} className="space-y-1.5">
              <Label htmlFor={`${p}${c.nome}`}>{c.rotulo}</Label>
              <Textarea id={`${p}${c.nome}`} name={c.nome} maxLength={5000} rows={2} defaultValue={questao?.[c.nome] ?? ""} placeholder={c.dica} />
            </div>
          ))}
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
