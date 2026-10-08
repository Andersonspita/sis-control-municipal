"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CampoAnexos } from "@/components/anexos/campo-anexos";
import { SeloGravidade } from "@/components/alertas/selos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { classificarRisco, ESCALA, IMPACTO, PROBABILIDADE } from "@/lib/risco";
import { salvarAchado, salvarRecomendacao } from "../actions";
import { CLASSE_SELECT } from "../filtros";

type ItemChecklist = { id: string; rotulo: string };
type Unidade = { id: string; nome: string; sigla: string | null };
export type ValoresAchado = {
  id: string;
  titulo: string;
  condicao: string;
  criterio: string;
  causa: string;
  efeito: string;
  probabilidade: number;
  impacto: number;
  itemChecklistId: string | null;
};

const CAMPOS_TCU = [
  { nome: "condicao", rotulo: "Condição", dica: "O que foi encontrado (a situação de fato, com dados e evidências)." },
  { nome: "criterio", rotulo: "Critério", dica: "O que deveria ser (lei, norma, contrato ou boa prática)." },
  { nome: "causa", rotulo: "Causa", dica: "Por que a condição ocorreu (falha de controle, de processo, de pessoal…)." },
  { nome: "efeito", rotulo: "Efeito", dica: "Consequência real ou potencial (dano, risco, prejuízo ao serviço)." },
] as const;

export function DialogoAchado({
  auditoriaId,
  itens,
  achado,
  itemInicial,
}: {
  auditoriaId: string;
  itens: ItemChecklist[];
  achado?: ValoresAchado;
  itemInicial?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [probabilidade, setProbabilidade] = useState(achado?.probabilidade ?? 3);
  const [impacto, setImpacto] = useState(achado?.impacto ?? 3);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarAchado, { aoConcluir: () => setAberto(false) });
  const p = achado ? `a-${achado.id}-` : `a-novo-${itemInicial ?? ""}-`;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {achado ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Pencil aria-hidden="true" /> Editar
        </DialogTrigger>
      ) : itemInicial ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Plus aria-hidden="true" /> Registrar achado
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="h-9" />}>
          <Plus aria-hidden="true" /> Novo achado
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{achado ? "Editar achado" : "Novo achado"}</DialogTitle>
          <DialogDescription>Padrão do TCU: condição, critério, causa e efeito, com a gravidade pela matriz de risco.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="auditoriaId" value={auditoriaId} />
          {achado && <input type="hidden" name="achadoId" value={achado.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}titulo`}>
              Título <span aria-hidden="true">*</span>
            </Label>
            <Input id={`${p}titulo`} name="titulo" required minLength={5} maxLength={300} defaultValue={achado?.titulo} className="h-9" />
          </div>
          {CAMPOS_TCU.map((c) => (
            <div key={c.nome} className="space-y-1.5">
              <Label htmlFor={`${p}${c.nome}`}>
                {c.rotulo} <span aria-hidden="true">*</span>
              </Label>
              <Textarea
                id={`${p}${c.nome}`}
                name={c.nome}
                required
                minLength={c.nome === "condicao" ? 10 : 5}
                maxLength={10000}
                rows={3}
                defaultValue={achado?.[c.nome]}
                placeholder={c.dica}
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}item`}>Item de checklist relacionado</Label>
            <select id={`${p}item`} name="itemChecklistId" defaultValue={achado?.itemChecklistId ?? itemInicial ?? ""} className={CLASSE_SELECT}>
              <option value="">Nenhum</option>
              {itens.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.rotulo}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
            <legend className="mb-2 text-sm font-medium">Gravidade (probabilidade × impacto)</legend>
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
          {!achado && <CampoAnexos rotulo="Evidências (opcional)" disabled={pendente} />}
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

export function DialogoRecomendacao({
  achadoId,
  unidades,
  recomendacao,
}: {
  achadoId: string;
  unidades: Unidade[];
  recomendacao?: { id: string; texto: string; unidadeId: string | null; prazo: string | null };
}) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarRecomendacao, { aoConcluir: () => setAberto(false) });
  const p = recomendacao ? `r-${recomendacao.id}-` : `r-novo-${achadoId}-`;
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {recomendacao ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar recomendação" title="Editar recomendação" />}>
          <Pencil aria-hidden="true" />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <Plus aria-hidden="true" /> Recomendação
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{recomendacao ? "Editar recomendação" : "Nova recomendação"}</DialogTitle>
          <DialogDescription>Depois de registrada, a recomendação pode virar ação no plano de ação da auditoria.</DialogDescription>
        </DialogHeader>
        <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
          <input type="hidden" name="achadoId" value={achadoId} />
          {recomendacao && <input type="hidden" name="recomendacaoId" value={recomendacao.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}texto`}>
              Recomendação <span aria-hidden="true">*</span>
            </Label>
            <Textarea
              id={`${p}texto`}
              name="texto"
              required
              minLength={10}
              maxLength={5000}
              rows={4}
              defaultValue={recomendacao?.texto}
              placeholder="O que a unidade deve fazer para corrigir a causa do achado."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}unidade`}>Unidade responsável</Label>
              <select id={`${p}unidade`} name="unidadeId" defaultValue={recomendacao?.unidadeId ?? ""} className={CLASSE_SELECT}>
                <option value="">A definir</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}prazo`}>Prazo sugerido</Label>
              <Input id={`${p}prazo`} name="prazo" type="date" defaultValue={recomendacao?.prazo ?? ""} className="h-9" />
            </div>
          </div>
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
