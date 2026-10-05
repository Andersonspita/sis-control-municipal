"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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
import { criarUsuario } from "./actions";
import { CampoSenha, CamposUsuario } from "./campos-usuario";

export function DialogoNovoUsuario() {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(criarUsuario);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button className="h-9" />}>
        <UserPlus aria-hidden="true" /> Novo usuário
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
            <DialogDescription>
              Depois de criar, você será levado à página do usuário para vinculá-lo aos clientes.
            </DialogDescription>
          </DialogHeader>
          <CamposUsuario prefixo="novo" />
          <CampoSenha prefixo="novo" rotulo="Senha inicial (mínimo de 10 caracteres)" />
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              Criar usuário
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
