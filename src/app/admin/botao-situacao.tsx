"use client";

import { useState } from "react";
import { Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import type { EstadoAcao } from "@/lib/acoes";

/** Ativa ou desativa um registro, pedindo confirmação. */
export function BotaoSituacao({
  acao,
  id,
  ativo,
  nome,
  aviso,
}: {
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>;
  id: string;
  ativo: boolean;
  nome: string;
  aviso?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(acao, { aoConcluir: () => setAberto(false) });
  const verbo = ativo ? "Desativar" : "Ativar";

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`${verbo} ${nome}`} />}>
        {ativo ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
        {verbo}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {verbo} {nome}?
            </DialogTitle>
            {ativo && aviso && <DialogDescription>{aviso}</DialogDescription>}
          </DialogHeader>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="ativo" value={String(!ativo)} />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" variant={ativo ? "destructive" : "default"} disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              {verbo}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
