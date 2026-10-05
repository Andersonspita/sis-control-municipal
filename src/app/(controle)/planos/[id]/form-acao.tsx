"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Save, Send, Trash2 } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SeloStatusAcao } from "@/components/selos-status";
import { Evidencias } from "@/components/anexos/evidencias";
import { STATUS_EDITAVEIS } from "@/lib/dados/acoes";
import type { StatusPlano } from "@/generated/prisma/browser";
import type { AcaoView, UnidadeOpcao } from "@/lib/dados/planos";
import { formatarDataSimples } from "@/lib/datas";
import { PRIORIDADE, STATUS_ACAO } from "@/lib/rotulos";
import { alternarMarco, criarMarco, excluirMarco, salvarAcao } from "../actions";

const classeSelect =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60";

function custoParaCampo(valor: string | null) {
  if (valor === null) return "";
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FormAcao({
  planoId,
  situacaoPlano,
  acao,
  unidades,
  onConcluido,
}: {
  planoId: string;
  situacaoPlano: StatusPlano;
  acao: AcaoView | null;
  unidades: UnidadeOpcao[];
  onConcluido: () => void;
}) {
  const [estado, enviar, pendente] = useActionState(salvarAcao, undefined);
  const concluida = acao?.status === "CONCLUIDA";

  useEffect(() => {
    if (estado?.ok) {
      toast.success(acao ? "Ação atualizada." : "Ação adicionada ao plano.");
      onConcluido();
    } else if (estado?.erro) {
      toast.error(estado.erro);
    }
  }, [estado, acao, onConcluido]);

  return (
    <div className="space-y-6">
      <form action={enviar} className="space-y-4">
        <input type="hidden" name="planoId" value={planoId} />
        {acao && <input type="hidden" name="id" value={acao.id} />}

        <div className="space-y-1.5">
          <Label htmlFor="acao-oque">O quê</Label>
          <Textarea id="acao-oque" name="oQue" required defaultValue={acao?.oQue} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acao-porque">Por quê</Label>
          <Textarea id="acao-porque" name="porQue" defaultValue={acao?.porQue ?? ""} rows={2} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acao-onde">Onde</Label>
          <Input id="acao-onde" name="onde" defaultValue={acao?.onde ?? ""} className="h-9" />
        </div>
        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-1.5 text-sm font-medium">Quem</legend>
          <div className="space-y-1.5">
            <Label htmlFor="acao-responsavel" className="text-xs text-muted-foreground">
              Responsável
            </Label>
            <Input id="acao-responsavel" name="responsavel" defaultValue={acao?.responsavel ?? ""} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acao-unidade" className="text-xs text-muted-foreground">
              Unidade responsável
            </Label>
            <select id="acao-unidade" name="unidadeResponsavelId" defaultValue={acao?.unidadeResponsavelId ?? ""} className={classeSelect}>
              <option value="">— Nenhuma —</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                </option>
              ))}
            </select>
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="acao-prazo">Quando (prazo)</Label>
            <Input id="acao-prazo" name="prazo" type="date" defaultValue={acao?.prazo ?? ""} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acao-custo">Quanto (custo estimado, R$)</Label>
            <Input
              id="acao-custo"
              name="custo"
              inputMode="decimal"
              placeholder="0,00"
              defaultValue={custoParaCampo(acao?.custoEstimado ?? null)}
              className="h-9"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="acao-como">Como</Label>
          <Textarea id="acao-como" name="como" defaultValue={acao?.como ?? ""} rows={3} />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="acao-prioridade">Prioridade</Label>
            <select id="acao-prioridade" name="prioridade" defaultValue={acao?.prioridade ?? "MEDIA"} className={classeSelect}>
              {Object.entries(PRIORIDADE).map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acao-status">Status</Label>
            {concluida ? (
              <p id="acao-status" className="flex h-9 items-center">
                <SeloStatusAcao status="CONCLUIDA" />
              </p>
            ) : (
              <select id="acao-status" name="status" defaultValue={acao?.status ?? "PENDENTE"} className={classeSelect}>
                {STATUS_EDITAVEIS.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_ACAO[s]}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acao-percentual">Execução (%)</Label>
            <Input
              id="acao-percentual"
              name="percentual"
              type="number"
              min={0}
              max={100}
              step={5}
              defaultValue={acao?.percentual ?? 0}
              disabled={concluida}
              className="h-9"
            />
          </div>
        </div>
        {!concluida && (
          <p className="text-xs text-muted-foreground">
            “Concluída” é atribuída pelo controlador ao validar a ação. Ao marcar “Aguardando validação”, a execução vai a 100%.
          </p>
        )}

        {acao?.parecerValidacao && (
          <div className="rounded-md bg-muted px-3 py-2 text-xs">
            <p className="font-semibold">
              {acao.validadoPor ? `Parecer de validação — ${acao.validadoPor}` : "Parecer da última devolução"}
            </p>
            <p className="mt-0.5 whitespace-pre-line">{acao.parecerValidacao}</p>
          </div>
        )}

        <Button type="submit" disabled={pendente} className="h-9 w-full">
          {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
          {acao ? "Salvar ação" : "Adicionar ação"}
        </Button>
      </form>

      {acao && <Marcos acao={acao} />}

      {acao && (
        <section aria-labelledby="titulo-evidencias-acao" className="space-y-3 border-t pt-5">
          <h3 id="titulo-evidencias-acao" className="text-sm font-semibold">
            Evidências <span className="font-normal text-muted-foreground">({acao.documentos.length})</span>
          </h3>
          <Evidencias alvo="acao" id={acao.id} iniciais={acao.documentos} bloqueado={acao.status === "CANCELADA"} />
          {situacaoPlano !== "CANCELADO" && acao.status !== "CANCELADA" && acao.status !== "CONCLUIDA" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted px-3 py-2">
              <p className="text-xs text-muted-foreground">Peça a execução ou a comprovação à unidade; a resposta aceita vira evidência.</p>
              <Link href={`/demandas/nova?acao=${acao.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                <Send aria-hidden="true" /> Enviar como demanda
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Marcos({ acao }: { acao: AcaoView }) {
  const [descricao, setDescricao] = useState("");
  const [prazo, setPrazo] = useState("");
  const [pendente, iniciar] = useTransition();

  function executar(fn: () => Promise<{ ok: true } | { ok: false; erro: string }>, aoConcluir?: () => void) {
    iniciar(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.erro);
      else aoConcluir?.();
    });
  }

  return (
    <section aria-labelledby="titulo-marcos" className="space-y-3 border-t pt-5">
      <h3 id="titulo-marcos" className="text-sm font-semibold">
        Marcos <span className="font-normal text-muted-foreground">({acao.marcos.filter((m) => m.concluido).length}/{acao.marcos.length} concluídos)</span>
      </h3>
      {acao.marcos.length > 0 ? (
        <ul className="space-y-1.5">
          {acao.marcos.map((m) => (
            <li key={m.id} className="flex items-center gap-2 rounded-md border px-2.5 py-1.5">
              <input
                id={`marco-${m.id}`}
                type="checkbox"
                checked={m.concluido}
                disabled={pendente}
                onChange={(e) => executar(() => alternarMarco({ marcoId: m.id, concluido: e.target.checked }))}
                className="size-4 accent-primary"
              />
              <label htmlFor={`marco-${m.id}`} className="flex-1 text-sm">
                <span className={m.concluido ? "text-muted-foreground line-through" : undefined}>{m.descricao}</span>
                {m.prazo && (
                  <span className="ml-2 text-xs text-muted-foreground tabular-nums">até {formatarDataSimples(new Date(m.prazo))}</span>
                )}
                {m.concluido && <span className="sr-only"> (concluído)</span>}
              </label>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={pendente}
                onClick={() => executar(() => excluirMarco(m.id))}
                aria-label={`Excluir marco: ${m.descricao}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Nenhum marco. Divida a ação em etapas com prazo, se útil.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_9.5rem_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="marco-descricao" className="text-xs">
            Novo marco
          </Label>
          <Input id="marco-descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} className="h-8" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="marco-prazo" className="text-xs">
            Prazo
          </Label>
          <Input id="marco-prazo" type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className="h-8" />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={pendente || descricao.trim().length < 2}
          onClick={() =>
            executar(
              () => criarMarco({ acaoId: acao.id, descricao, prazo }),
              () => {
                setDescricao("");
                setPrazo("");
              },
            )
          }
        >
          {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />} Adicionar
        </Button>
      </div>
    </section>
  );
}
