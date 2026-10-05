"use client";

import { useState } from "react";
import { Loader2, Save, Send } from "lucide-react";
import type { OrigemSituacao } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoAnexos } from "@/components/anexos/campo-anexos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { SeloGravidade } from "@/components/medidas/selos";
import { classificarRisco, ESCALA, IMPACTO, PROBABILIDADE } from "@/lib/risco";
import { ORIGEM_SITUACAO } from "@/lib/rotulos";
import { criarSituacao, editarSituacao } from "./actions";
import { CLASSE_SELECT } from "./filtros";

type Unidade = { id: string; nome: string; sigla: string | null };

export type ValoresSituacao = {
  id: string;
  titulo: string;
  descricao: string;
  origem: OrigemSituacao;
  unidadeId: string | null;
  probabilidade: number;
  impacto: number;
  sigilosa: boolean;
  denunciante: string | null;
  denuncianteOculto: boolean;
};

/** Cadastro (com anexos) ou edição de uma situação. */
export function FormSituacao({
  unidades,
  iniciais,
  aoConcluir,
}: {
  unidades: Unidade[];
  iniciais?: ValoresSituacao;
  aoConcluir?: () => void;
}) {
  const edicao = !!iniciais;
  const { pendente, formRef, onSubmit } = useAcaoFormulario(edicao ? editarSituacao : criarSituacao, { aoConcluir });
  const [origem, setOrigem] = useState<OrigemSituacao | "">(iniciais?.origem ?? "");
  const [probabilidade, setProbabilidade] = useState(iniciais?.probabilidade ?? 3);
  const [impacto, setImpacto] = useState(iniciais?.impacto ?? 3);
  // Quem não pode ver o denunciante também não altera origem nem sigilo (a action preserva os valores).
  const sigiloTravado = !!iniciais?.denuncianteOculto;
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
          placeholder="Ex.: Pagamentos sem liquidação na Secretaria de Obras"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${p}descricao`}>
          Descrição <span aria-hidden="true">*</span>
        </Label>
        <Textarea
          id={`${p}descricao`}
          name="descricao"
          required
          minLength={10}
          maxLength={10000}
          rows={6}
          defaultValue={iniciais?.descricao}
          placeholder="O que foi constatado, quando, onde e quais os possíveis efeitos."
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${p}origem`}>
            Origem <span aria-hidden="true">*</span>
          </Label>
          {sigiloTravado && <input type="hidden" name="origem" value={origem} />}
          <select
            id={`${p}origem`}
            name={sigiloTravado ? undefined : "origem"}
            required
            disabled={sigiloTravado}
            value={origem}
            onChange={(e) => setOrigem(e.target.value as OrigemSituacao)}
            className={CLASSE_SELECT}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {Object.entries(ORIGEM_SITUACAO).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${p}unidadeId`}>Unidade envolvida</Label>
          <select id={`${p}unidadeId`} name="unidadeId" defaultValue={iniciais?.unidadeId ?? ""} className={CLASSE_SELECT}>
            <option value="">Nenhuma / não se aplica</option>
            {unidades.map((u) => (
              <option key={u.id} value={u.id}>
                {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      {origem === "DENUNCIA" &&
        (sigiloTravado ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
            Denúncia sigilosa: a identidade do denunciante é visível somente ao controlador.
          </p>
        ) : (
          <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <legend className="px-1 text-sm font-medium">Denúncia</legend>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}denunciante`}>Denunciante (opcional)</Label>
              <Input
                id={`${p}denunciante`}
                name="denunciante"
                maxLength={300}
                defaultValue={iniciais?.denunciante ?? ""}
                className="h-9"
                placeholder="Nome e contato, se informados"
              />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="sigilosa"
                defaultChecked={iniciais?.sigilosa}
                className="size-4 rounded border-input accent-primary"
              />
              Denúncia sigilosa
            </label>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Quando sigilosa, o denunciante fica oculto para a equipe; só o controlador o vê. O nome nunca vai para a trilha.
            </p>
          </fieldset>
        ))}

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Gravidade (probabilidade × impacto)</legend>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
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
            <select
              id={`${p}impacto`}
              name="impacto"
              value={impacto}
              onChange={(e) => setImpacto(Number(e.target.value))}
              className={CLASSE_SELECT}
            >
              {ESCALA.map((v) => (
                <option key={v} value={v}>
                  {v} — {IMPACTO[v]}
                </option>
              ))}
            </select>
          </div>
          <p className="flex h-9 items-center gap-2 text-sm" aria-live="polite">
            <span className="text-muted-foreground">Gravidade:</span>
            <SeloGravidade nivel={classificarRisco(probabilidade, impacto)} pontuacao={probabilidade * impacto} />
          </p>
        </div>
      </fieldset>

      {!edicao && <CampoAnexos rotulo="Anexos (opcional)" disabled={pendente} />}
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
          {edicao ? "Salvar alterações" : "Registrar situação"}
        </Button>
      </div>
    </form>
  );
}
