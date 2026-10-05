"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ORIGEM_PLANO } from "@/lib/rotulos";
import { criarPlano } from "./actions";

const ORIGENS = ["OUTRA", "DETERMINACAO_TC"] as const;

export function DialogoNovoPlano() {
  const [aberto, setAberto] = useState(false);
  const [estado, acao, pendente] = useActionState(criarPlano, undefined);

  useEffect(() => {
    if (estado?.erro) toast.error(estado.erro);
  }, [estado]);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-9" />}>
        <Plus aria-hidden="true" /> Novo plano
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo plano de ação</DialogTitle>
          <DialogDescription>Plano avulso; as ações 5W2H são adicionadas em seguida.</DialogDescription>
        </DialogHeader>
        <form action={acao} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="plano-titulo">Título</Label>
            <Input id="plano-titulo" name="titulo" required className="h-9" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Origem</legend>
            <div className="flex flex-wrap gap-2">
              {ORIGENS.map((o, i) => (
                <label
                  key={o}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm has-checked:border-primary has-checked:bg-primary/10 has-checked:font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                >
                  <input type="radio" name="origem" value={o} defaultChecked={i === 0} className="accent-primary" />
                  {ORIGEM_PLANO[o]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="plano-descricao">Descrição</Label>
            <Textarea id="plano-descricao" name="descricao" rows={3} placeholder="Contexto, número do processo ou da determinação…" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-9" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente} className="h-9">
              {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
              Criar plano
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
