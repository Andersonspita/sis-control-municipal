"use client";

import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoAnexos } from "@/components/anexos/campo-anexos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { PRIORIDADE } from "@/lib/rotulos";
import { criarDemanda } from "../actions";
import { CLASSE_SELECT } from "../filtros";

type Unidade = { id: string; nome: string; sigla: string | null; responsavelNome: string | null };

/** Pré-preenchimento quando a demanda nasce de um requisito da autoavaliação ou de uma ação de plano. */
export type ValoresIniciais = {
  assunto?: string;
  descricao?: string;
  unidadeDestinoId?: string;
  prazo?: string;
  prioridade?: keyof typeof PRIORIDADE;
  respostaRequisitoId?: string;
  acaoId?: string;
};

export function FormDemanda({
  unidades,
  prazoMinimo,
  prazoPadrao,
  iniciais = {},
}: {
  unidades: Unidade[];
  prazoMinimo: string;
  prazoPadrao: string;
  iniciais?: ValoresIniciais;
}) {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(criarDemanda);

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5" aria-busy={pendente}>
      {iniciais.respostaRequisitoId && <input type="hidden" name="respostaRequisitoId" value={iniciais.respostaRequisitoId} />}
      {iniciais.acaoId && <input type="hidden" name="acaoId" value={iniciais.acaoId} />}
      <div className="space-y-1.5">
        <Label htmlFor="assunto">
          Assunto <span aria-hidden="true">*</span>
        </Label>
        <Input
          id="assunto"
          name="assunto"
          required
          minLength={5}
          maxLength={200}
          defaultValue={iniciais.assunto}
          className="h-9"
          placeholder="Ex.: Lista de espera da regulação"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="descricao">
          O que está sendo solicitado <span aria-hidden="true">*</span>
        </Label>
        <Textarea
          id="descricao"
          name="descricao"
          required
          minLength={10}
          maxLength={10000}
          rows={iniciais.descricao ? 10 : 6}
          defaultValue={iniciais.descricao}
          aria-describedby="descricao-dica"
          placeholder="Descreva as informações e os documentos que a unidade deve enviar."
        />
        <p id="descricao-dica" className="text-xs text-muted-foreground">
          Seja específico: indique período, formato esperado e a fundamentação, se houver.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor="unidadeDestinoId">
            Unidade destinatária <span aria-hidden="true">*</span>
          </Label>
          <select id="unidadeDestinoId" name="unidadeDestinoId" required defaultValue={iniciais.unidadeDestinoId ?? ""} className={CLASSE_SELECT}>
            <option value="" disabled>
              Selecione…
            </option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                {u.responsavelNome ? ` (${u.responsavelNome})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prazo">
            Prazo <span aria-hidden="true">*</span>
          </Label>
          <Input id="prazo" name="prazo" type="date" required min={prazoMinimo} defaultValue={iniciais.prazo ?? prazoPadrao} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="prioridade">Prioridade</Label>
          <select id="prioridade" name="prioridade" defaultValue={iniciais.prioridade ?? "MEDIA"} className={CLASSE_SELECT}>
            {Object.entries(PRIORIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <CampoAnexos rotulo="Anexos (opcional)" disabled={pendente} />
      <p className="text-xs text-muted-foreground">
        <span aria-hidden="true">*</span> Campos obrigatórios. A numeração (ex.: 001/{prazoMinimo.slice(0, 4)}) é gerada ao enviar.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Enviar demanda
        </Button>
      </div>
    </form>
  );
}
