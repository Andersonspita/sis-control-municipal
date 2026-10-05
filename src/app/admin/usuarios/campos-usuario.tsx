"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascararCpf } from "@/lib/documentos-br";

export type UsuarioEditavel = { id: string; nome: string; email: string; cpf: string | null; adminHorizon: boolean };

/** Campos comuns ao cadastro e à edição de usuário. */
export function CamposUsuario({ prefixo, usuario }: { prefixo: string; usuario?: UsuarioEditavel }) {
  const [cpf, setCpf] = useState(usuario?.cpf ? mascararCpf(usuario.cpf) : "");

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${prefixo}-nome`}>
          Nome completo <span aria-hidden="true">*</span>
        </Label>
        <Input
          id={`${prefixo}-nome`}
          name="nome"
          required
          minLength={3}
          maxLength={200}
          defaultValue={usuario?.nome}
          autoComplete="off"
          className="h-9"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-email`}>
            E-mail <span aria-hidden="true">*</span>
          </Label>
          <Input
            id={`${prefixo}-email`}
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={usuario?.email}
            autoComplete="off"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefixo}-cpf`}>CPF</Label>
          <Input
            id={`${prefixo}-cpf`}
            name="cpf"
            inputMode="numeric"
            value={cpf}
            onChange={(e) => setCpf(mascararCpf(e.target.value))}
            autoComplete="off"
            className="h-9 font-mono"
            placeholder="000.000.000-00"
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <input
          id={`${prefixo}-admin`}
          name="adminHorizon"
          type="checkbox"
          defaultChecked={usuario?.adminHorizon}
          aria-describedby={`${prefixo}-admin-dica`}
          className="mt-0.5 size-4 accent-primary"
        />
        <div>
          <Label htmlFor={`${prefixo}-admin`}>Administrador HorizonAJ</Label>
          <p id={`${prefixo}-admin-dica`} className="text-xs text-muted-foreground">
            Acesso total a esta área de administração (clientes, usuários e trilha global).
          </p>
        </div>
      </div>
    </>
  );
}

export function CampoSenha({ prefixo, rotulo = "Senha", nome = "senha" }: { prefixo: string; rotulo?: string; nome?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={`${prefixo}-${nome}`}>
        {rotulo} <span aria-hidden="true">*</span>
      </Label>
      <Input
        id={`${prefixo}-${nome}`}
        name={nome}
        type="password"
        required
        minLength={10}
        maxLength={128}
        autoComplete="new-password"
        className="h-9"
      />
    </div>
  );
}
