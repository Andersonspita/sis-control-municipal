"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { mascararCnpj, UFS } from "@/lib/documentos-br";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import type { TipoCliente } from "@/generated/prisma/enums";
import { salvarCliente } from "./actions";
import { CLASSE_SELECT } from "./comum";

export type ClienteEditavel = {
  id: string;
  nome: string;
  tipo: TipoCliente;
  cnpj: string;
  municipio: string;
  uf: string;
  codigoIbge: string | null;
  populacao: number | null;
};

export function DialogoCliente({ cliente }: { cliente?: ClienteEditavel }) {
  const [aberto, setAberto] = useState(false);
  const [cnpj, setCnpj] = useState(cliente ? mascararCnpj(cliente.cnpj) : "");
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarCliente, {
    aoConcluir: () => {
      setAberto(false);
      if (!cliente) setCnpj("");
    },
  });
  const p = cliente ? `cli-${cliente.id}` : "cli-novo";

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {cliente ? (
        <DialogTrigger render={<Button variant="ghost" size="sm" aria-label={`Editar ${cliente.nome}`} />}>
          <Pencil aria-hidden="true" /> Editar
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button className="h-9" />}>
          <Plus aria-hidden="true" /> Novo cliente
        </DialogTrigger>
      )}
      <DialogContent showCloseButton={false} className="sm:max-w-xl">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{cliente ? "Editar cliente" : "Novo cliente"}</DialogTitle>
            <DialogDescription>Cada entidade (Prefeitura, Câmara, autarquia…) é um cliente com dados isolados.</DialogDescription>
          </DialogHeader>
          {cliente && <input type="hidden" name="id" value={cliente.id} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${p}-nome`}>
              Nome da entidade <span aria-hidden="true">*</span>
            </Label>
            <Input
              id={`${p}-nome`}
              name="nome"
              required
              minLength={3}
              maxLength={200}
              defaultValue={cliente?.nome}
              className="h-9"
              placeholder="Ex.: Prefeitura Municipal de Exemplo"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-tipo`}>
                Tipo <span aria-hidden="true">*</span>
              </Label>
              <select id={`${p}-tipo`} name="tipo" required defaultValue={cliente?.tipo ?? ""} className={CLASSE_SELECT}>
                <option value="" disabled>
                  Selecione…
                </option>
                {Object.entries(TIPO_CLIENTE).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-cnpj`}>
                CNPJ <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={`${p}-cnpj`}
                name="cnpj"
                required
                value={cnpj}
                onChange={(e) => setCnpj(mascararCnpj(e.target.value))}
                inputMode="text"
                autoComplete="off"
                className="h-9 font-mono"
                placeholder="00.000.000/0000-00"
              />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_6rem]">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-municipio`}>
                Município <span aria-hidden="true">*</span>
              </Label>
              <Input
                id={`${p}-municipio`}
                name="municipio"
                required
                minLength={2}
                maxLength={120}
                defaultValue={cliente?.municipio}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-uf`}>
                UF <span aria-hidden="true">*</span>
              </Label>
              <select id={`${p}-uf`} name="uf" required defaultValue={cliente?.uf ?? ""} className={CLASSE_SELECT}>
                <option value="" disabled>
                  —
                </option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-ibge`}>Código IBGE</Label>
              <Input
                id={`${p}-ibge`}
                name="codigoIbge"
                inputMode="numeric"
                pattern="\d{7}"
                maxLength={7}
                defaultValue={cliente?.codigoIbge ?? ""}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`${p}-populacao`}>População</Label>
              <Input
                id={`${p}-populacao`}
                name="populacao"
                inputMode="numeric"
                pattern="\d*"
                maxLength={9}
                defaultValue={cliente?.populacao ?? ""}
                className="h-9"
              />
            </div>
          </div>
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
