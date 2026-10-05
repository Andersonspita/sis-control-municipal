"use client";

import { Loader2, Save, Send } from "lucide-react";
import type { TipoAuditoria } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { TIPO_AUDITORIA } from "@/lib/rotulos";
import { criarAuditoria, editarAuditoria } from "./actions";
import { CLASSE_SELECT } from "./filtros";

type Unidade = { id: string; nome: string; sigla: string | null };
type Membro = { id: string; nome: string };

export type ValoresAuditoria = {
  id: string;
  titulo: string;
  tipo: TipoAuditoria;
  objetivo: string;
  escopo: string | null;
  criterios: string | null;
  unidadeId: string | null;
  inicioPrevisto: string | null;
  fimPrevisto: string | null;
  equipeIds: string[];
};

/** Cadastro ou edição dos dados de planejamento da auditoria (inclui alcance e equipe). */
export function FormAuditoria({
  unidades,
  membros,
  iniciais,
  aoConcluir,
}: {
  unidades: Unidade[];
  membros: Membro[];
  iniciais?: ValoresAuditoria;
  aoConcluir?: () => void;
}) {
  const edicao = !!iniciais;
  const { pendente, formRef, onSubmit } = useAcaoFormulario(edicao ? editarAuditoria : criarAuditoria, { aoConcluir });
  const p = edicao ? "editar-" : "";

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-5" aria-busy={pendente}>
      {iniciais && <input type="hidden" name="id" value={iniciais.id} />}
      <div className="space-y-1.5">
        <Label htmlFor={`${p}titulo`}>
          Título <span aria-hidden="true">*</span>
        </Label>
        <Input
          id={`${p}titulo`}
          name="titulo"
          required
          minLength={5}
          maxLength={200}
          defaultValue={iniciais?.titulo}
          className="h-9"
          placeholder="Ex.: Auditoria nas dispensas de licitação da Secretaria de Saúde"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}tipo`}>
            Tipo <span aria-hidden="true">*</span>
          </Label>
          <select id={`${p}tipo`} name="tipo" required defaultValue={iniciais?.tipo ?? ""} className={CLASSE_SELECT}>
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
          <Label htmlFor={`${p}unidadeId`}>Alcance</Label>
          <select id={`${p}unidadeId`} name="unidadeId" defaultValue={iniciais?.unidadeId ?? ""} className={CLASSE_SELECT}>
            <option value="">Entidade inteira</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                Unidade: {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}objetivo`}>
          Objetivo <span aria-hidden="true">*</span>
        </Label>
        <Textarea
          id={`${p}objetivo`}
          name="objetivo"
          required
          minLength={10}
          maxLength={5000}
          rows={3}
          defaultValue={iniciais?.objetivo}
          placeholder="O que a auditoria pretende verificar ou avaliar."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}escopo`}>Escopo</Label>
          <Textarea
            id={`${p}escopo`}
            name="escopo"
            maxLength={10000}
            rows={4}
            defaultValue={iniciais?.escopo ?? ""}
            placeholder="Processos, período e limites do exame."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}criterios`}>Critérios e normas</Label>
          <Textarea
            id={`${p}criterios`}
            name="criterios"
            maxLength={10000}
            rows={4}
            defaultValue={iniciais?.criterios ?? ""}
            placeholder="Leis, decretos, normas internas e boas práticas de referência."
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}inicioPrevisto`}>Início previsto</Label>
          <Input id={`${p}inicioPrevisto`} name="inicioPrevisto" type="date" defaultValue={iniciais?.inicioPrevisto ?? ""} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}fimPrevisto`}>Fim previsto</Label>
          <Input id={`${p}fimPrevisto`} name="fimPrevisto" type="date" defaultValue={iniciais?.fimPrevisto ?? ""} className="h-9" />
        </div>
      </div>
      <fieldset className="space-y-2 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Equipe de auditoria</legend>
        {membros.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum usuário da controladoria disponível.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {membros.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="equipe"
                  value={m.id}
                  defaultChecked={iniciais?.equipeIds.includes(m.id)}
                  className="size-4 rounded border-input accent-primary"
                />
                {m.nome}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">Só usuários da controladoria. A execução exige ao menos um integrante.</p>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        <span aria-hidden="true">*</span> Campos obrigatórios.{!edicao && " A numeração (ex.: 001/2026) é gerada ao registrar."}
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : edicao ? (
            <Save aria-hidden="true" />
          ) : (
            <Send aria-hidden="true" />
          )}
          {edicao ? "Salvar alterações" : "Registrar auditoria"}
        </Button>
      </div>
    </form>
  );
}
