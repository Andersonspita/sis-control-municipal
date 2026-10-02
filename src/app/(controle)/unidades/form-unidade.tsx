"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIPO_UNIDADE } from "@/lib/rotulos";
import { criarUnidade } from "./actions";

const classeSelect =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function FormUnidade({ unidades }: { unidades: { id: string; nome: string; sigla: string | null }[] }) {
  const [estado, acao, pendente] = useActionState(criarUnidade, undefined);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) {
      toast.success("Unidade cadastrada.");
      form.current?.reset();
    } else if (estado?.erro) {
      toast.error(estado.erro);
    }
  }, [estado]);

  return (
    <form ref={form} action={acao} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" required className="h-9" placeholder="Secretaria Municipal de Saúde" />
      </div>
      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="sigla">Sigla</Label>
          <Input id="sigla" name="sigla" className="h-9" placeholder="SESAU" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="tipo">Tipo</Label>
          <select id="tipo" name="tipo" defaultValue="SECRETARIA" className={classeSelect}>
            {Object.entries(TIPO_UNIDADE).map(([valor, rotulo]) => (
              <option key={valor} value={valor}>
                {rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="paiId">Subordinada a</Label>
        <select id="paiId" name="paiId" defaultValue="" className={classeSelect}>
          <option value="">— Nenhuma (unidade principal) —</option>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="responsavelNome">Responsável</Label>
        <Input id="responsavelNome" name="responsavelNome" className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="responsavelEmail">E-mail do responsável</Label>
        <Input id="responsavelEmail" name="responsavelEmail" type="email" className="h-9" />
      </div>
      <Button type="submit" disabled={pendente} className="h-9 w-full">
        {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}
        Cadastrar unidade
      </Button>
    </form>
  );
}
