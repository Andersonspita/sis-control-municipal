"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { abrirCiclo } from "./actions";

const classeSelect =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Norma = { id: string; codigo: string; titulo: string; requisitos: number };
type Unidade = { id: string; nome: string; sigla: string | null };

export function DialogoAbrirCiclo({
  normas,
  unidades,
  hoje,
  anoAtual,
}: {
  normas: Norma[];
  unidades: Unidade[];
  hoje: string;
  anoAtual: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, pendente] = useActionState(abrirCiclo, undefined);

  useEffect(() => {
    if (estado?.erro) toast.error(estado.erro);
  }, [estado]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-9" />}>
        <Plus aria-hidden="true" /> Abrir ciclo
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Abrir ciclo de autoavaliação</DialogTitle>
          <DialogDescription>
            Serão incluídos apenas os requisitos avaliáveis que se aplicam ao tipo desta entidade.
          </DialogDescription>
        </DialogHeader>
        <form action={acao} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ciclo-nome">Nome do ciclo</Label>
            <Input id="ciclo-nome" name="nome" required className="h-9" defaultValue={`Autoavaliação ${anoAtual}`} />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Normas</legend>
            <p className="text-xs text-muted-foreground">Cada norma marcada gera um ciclo próprio, com o mesmo nome e alcance.</p>
            <ul className="space-y-2">
              {normas.map((n, i) => (
                <li key={n.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50">
                    <input
                      type="checkbox"
                      name="normaId"
                      value={n.id}
                      defaultChecked={i === 0}
                      disabled={n.requisitos === 0}
                      className="mt-0.5 size-4 accent-primary"
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block text-sm font-medium leading-snug">{n.titulo}</span>
                      <span className="block text-xs text-muted-foreground">
                        <span className="font-mono">{n.codigo}</span> · {n.requisitos} requisitos aplicáveis
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <div className="space-y-1.5">
              <Label htmlFor="ciclo-unidade">Alcance</Label>
              <select id="ciclo-unidade" name="unidadeId" defaultValue="" className={classeSelect}>
                <option value="">Entidade inteira</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ciclo-inicio">Data de início</Label>
              <Input id="ciclo-inicio" name="dataInicio" type="date" required defaultValue={hoje} className="h-9" />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" className="h-9" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente} className="h-9">
              {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
              Abrir ciclo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
