"use client";

import { useState } from "react";
import { Loader2, Pencil } from "lucide-react";
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
import { salvarMunicipio } from "./actions";
import { CamposMunicipio, type MunicipioCadastrado } from "./campos-municipio";

export function DialogoMunicipio({ municipio }: { municipio: MunicipioCadastrado }) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarMunicipio, { aoConcluir: () => setAberto(false) });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Editar município ${municipio.nome}`} />}>
        <Pencil aria-hidden="true" /> Editar
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {municipio.nome}/{municipio.uf}
            </DialogTitle>
            <DialogDescription>
              Nome, UF e código IBGE valem para todas as entidades do município. Ao trocar o link, o endereço antigo
              deixa de funcionar.
            </DialogDescription>
          </DialogHeader>
          <input type="hidden" name="id" value={municipio.id} />
          {aberto && <CamposMunicipio prefixo={`mun-${municipio.id}`} inicial={municipio} />}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
