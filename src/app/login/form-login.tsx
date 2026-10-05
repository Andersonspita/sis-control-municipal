"use client";

import { useActionState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { entrar } from "./actions";

export function FormLogin({ voltar, municipio }: { voltar?: string; municipio?: string }) {
  const [estado, acao, pendente] = useActionState(entrar, undefined);

  return (
    <form action={acao} className="space-y-5" noValidate>
      {voltar && <input type="hidden" name="voltar" value={voltar} />}
      {municipio && <input type="hidden" name="municipio" value={municipio} />}

      {estado?.erro && (
        <Alert variant="destructive" aria-live="assertive">
          <AlertCircle />
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          defaultValue={estado?.email}
          className="h-10"
          aria-invalid={estado?.erro ? true : undefined}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          className="h-10"
          aria-invalid={estado?.erro ? true : undefined}
        />
      </div>

      <Button type="submit" className="h-10 w-full" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
        {pendente ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
