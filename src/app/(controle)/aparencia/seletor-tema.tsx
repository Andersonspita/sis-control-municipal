"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMA_PADRAO, TEMAS, type Navegacao } from "@/lib/temas";
import { definirTema } from "./actions";

const NAVEGACAO: Record<Navegacao, string> = {
  lateral: "Menu lateral",
  topo: "Menu no topo em dois níveis",
  trilho: "Trilho de ícones com painel do grupo",
  faixas: "Menu no topo em duas faixas",
};

function Linha({ className }: { className?: string }) {
  return <span className={cn("block h-1 rounded-full", className)} />;
}

function ConteudoPrevia() {
  return (
    <div className="min-w-0 flex-1 space-y-2 p-2.5">
      <Linha className="h-1.5 w-16 bg-foreground/80" />
      <div className="grid grid-cols-3 gap-1.5">
        {["bg-primary", "bg-destaque", "bg-perigo"].map((cor) => (
          <div key={cor} className="space-y-1 rounded-sm border bg-card p-1.5 shadow-sm">
            <Linha className={cn("w-5", cor)} />
            <Linha className="h-2 w-4 bg-foreground/70" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5 rounded-sm border bg-card p-1.5 shadow-sm">
        {["w-3/5", "w-2/5"].map((largura) => (
          <div key={largura} className="h-1.5 rounded-full bg-muted">
            <div className={cn("h-full rounded-full bg-primary", largura)} />
          </div>
        ))}
        <div className="flex gap-1 pt-0.5">
          <span className="h-2 w-6 rounded-full bg-sucesso-fundo" />
          <span className="h-2 w-6 rounded-full bg-alerta-fundo" />
          <span className="h-2 w-6 rounded-full bg-perigo-fundo" />
        </div>
      </div>
      <div className="flex gap-1">
        <span className="h-3 w-10 rounded-sm bg-primary" />
        <span className="h-3 w-8 rounded-sm border bg-card" />
      </div>
    </div>
  );
}

function Previa({ navegacao }: { navegacao: Navegacao }) {
  const ativo = "bg-sidebar-primary";
  const inativo = "bg-sidebar-foreground/40";
  if (navegacao === "lateral") {
    return (
      <div className="flex h-full">
        <div className="w-14 shrink-0 space-y-1.5 bg-sidebar p-2">
          <span className="mb-2 block size-3 rounded-sm bg-sidebar-primary" />
          <div className="rounded-sm bg-sidebar-accent p-1">
            <Linha className={ativo} />
          </div>
          {[1, 2, 3, 4].map((i) => (
            <Linha key={i} className={cn("mx-1", inativo)} />
          ))}
        </div>
        <ConteudoPrevia />
      </div>
    );
  }
  if (navegacao === "trilho") {
    return (
      <div className="flex h-full">
        <div className="flex w-6 shrink-0 flex-col items-center gap-2 bg-sidebar pt-2">
          <span className="size-3 rounded-sm bg-sidebar-primary" />
          <span className="size-2.5 rounded-sm bg-sidebar-accent ring-1 ring-sidebar-primary" />
          {[1, 2, 3].map((i) => (
            <span key={i} className={cn("size-2.5 rounded-sm", inativo)} />
          ))}
        </div>
        <div className="w-12 shrink-0 space-y-1.5 border-r bg-card p-1.5 pt-2.5">
          <div className="rounded-sm bg-accent p-1">
            <Linha className="bg-destaque" />
          </div>
          {[1, 2].map((i) => (
            <Linha key={i} className="mx-1 bg-foreground/30" />
          ))}
        </div>
        <ConteudoPrevia />
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-5 shrink-0 items-center gap-2 bg-sidebar px-2">
        <span className="size-2.5 rounded-sm bg-sidebar-primary" />
        {navegacao === "topo" &&
          [0, 1, 2, 3].map((i) => <Linha key={i} className={cn("w-6", i === 1 ? ativo : inativo)} />)}
        <Linha className={cn("ml-auto w-8", inativo)} />
      </div>
      <div className="flex h-4 shrink-0 items-center gap-2 border-b bg-card px-2">
        {navegacao === "topo"
          ? [0, 1, 2].map((i) => <Linha key={i} className={cn("w-7", i === 0 ? "bg-primary" : "bg-foreground/30")} />)
          : [0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("flex gap-1", i > 0 && "border-l pl-2")}>
                <Linha className={cn("w-4", i === 1 ? "bg-destaque" : "bg-foreground/30")} />
                <Linha className="w-4 bg-foreground/30" />
              </span>
            ))}
      </div>
      <ConteudoPrevia />
    </div>
  );
}

export function SeletorTema({ atual, podeAlterar }: { atual: string; podeAlterar: boolean }) {
  const [escolhido, setEscolhido] = useState(atual);
  const [estado, acao, pendente] = useActionState(definirTema, undefined);

  useEffect(() => {
    if (estado?.ok) toast.success("Tema aplicado a esta entidade.");
    else if (estado?.erro) toast.error(estado.erro);
  }, [estado]);

  return (
    <form action={acao} autoComplete="off" className="space-y-6">
      <fieldset disabled={!podeAlterar || pendente}>
        <legend className="sr-only">Tema da entidade</legend>
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {TEMAS.map((tema) => {
            const marcado = escolhido === tema.id;
            return (
              <label
                key={tema.id}
                className={cn(
                  "group relative flex cursor-pointer flex-col overflow-hidden rounded-lg border bg-card shadow-sm transition-shadow",
                  "has-focus-visible:ring-3 has-focus-visible:ring-ring/50 has-disabled:cursor-default",
                  marcado ? "border-primary ring-2 ring-primary" : "hover:shadow-md",
                )}
              >
                <input
                  type="radio"
                  name="tema"
                  value={tema.id}
                  checked={marcado}
                  onChange={() => setEscolhido(tema.id)}
                  className="sr-only"
                />
                <div data-tema={tema.id} className="border-b bg-background font-sans text-foreground">
                  <div className="h-40 overflow-hidden" aria-hidden="true">
                    <Previa navegacao={tema.navegacao} />
                  </div>
                  <p className="border-t bg-card px-3 py-2 font-heading text-sm font-semibold">
                    Controladoria Municipal <span className="font-mono text-xs font-normal text-muted-foreground">001/2026</span>
                  </p>
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">
                      {tema.numero} · {tema.nome}
                    </span>
                    <span className="flex shrink-0 gap-1.5">
                      {tema.id === TEMA_PADRAO && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          <Star aria-hidden="true" className="size-3" /> Padrão
                        </span>
                      )}
                      {tema.id === atual && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-sucesso-fundo px-2 py-0.5 text-xs font-medium text-sucesso">
                          <Check aria-hidden="true" className="size-3" /> Em uso
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tema.resumo}</p>
                  <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-2 text-xs">
                    <dt className="text-muted-foreground">Navegação</dt>
                    <dd>{NAVEGACAO[tema.navegacao]}</dd>
                    <dt className="text-muted-foreground">Fontes</dt>
                    <dd>{tema.fontes}</dd>
                  </dl>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {podeAlterar && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pendente || escolhido === atual}>
            {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
            Aplicar à entidade
          </Button>
          {escolhido !== atual && (
            <Button type="button" variant="ghost" onClick={() => setEscolhido(atual)} disabled={pendente}>
              Desfazer escolha
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
