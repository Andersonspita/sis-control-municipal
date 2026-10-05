"use client";

import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { mascararCpf, somenteDigitos } from "@/lib/documentos-br";
import { alterarMeuEmail, alterarMinhaSenha, atualizarMeuPerfil } from "./actions";

function mascararTelefone(valor: string) {
  const d = somenteDigitos(valor).slice(0, 11);
  if (d.length <= 2) return d;
  const meio = d.length === 11 ? 7 : 6;
  return `(${d.slice(0, 2)}) ${d.slice(2, meio)}${d.length > meio ? `-${d.slice(meio)}` : ""}`;
}

function BotaoSalvar({ pendente, rotulo }: { pendente: boolean; rotulo: string }) {
  return (
    <div className="flex justify-end">
      <Button type="submit" size="lg" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
        {rotulo}
      </Button>
    </div>
  );
}

export function FormPerfil({
  perfil,
  cargo,
}: {
  perfil: { nome: string; cpf: string | null; telefone: string | null };
  /** Ausente quando o usuário não tem cliente ativo (sem vínculo para editar). */
  cargo?: { valor: string; entidade: string };
}) {
  const { pendente, onSubmit } = useAcaoFormulario(atualizarMeuPerfil);
  return (
    <form onSubmit={onSubmit} className="grid gap-5" aria-busy={pendente}>
      <div className="space-y-1.5">
        <Label htmlFor="perfil-nome">Nome completo</Label>
        <Input id="perfil-nome" name="nome" defaultValue={perfil.nome} required minLength={3} maxLength={200} autoComplete="name" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="perfil-cpf">CPF (opcional)</Label>
          <Input
            id="perfil-cpf"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            defaultValue={perfil.cpf ? mascararCpf(perfil.cpf) : ""}
            onChange={(e) => (e.currentTarget.value = mascararCpf(e.currentTarget.value))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perfil-telefone">Telefone ou celular (opcional)</Label>
          <Input
            id="perfil-telefone"
            name="telefone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(00) 00000-0000"
            defaultValue={perfil.telefone ? mascararTelefone(perfil.telefone) : ""}
            onChange={(e) => (e.currentTarget.value = mascararTelefone(e.currentTarget.value))}
          />
        </div>
      </div>
      {cargo && (
        <div className="space-y-1.5">
          <Label htmlFor="perfil-cargo">Cargo em {cargo.entidade} (opcional)</Label>
          <Input id="perfil-cargo" name="cargo" defaultValue={cargo.valor} maxLength={120} placeholder="Ex.: Controlador-Geral" />
          <p className="text-xs text-muted-foreground">Aparece no menu do usuário e vale só para esta entidade.</p>
        </div>
      )}
      <BotaoSalvar pendente={pendente} rotulo="Salvar perfil" />
    </form>
  );
}

export function FormEmail({ email }: { email: string }) {
  const { pendente, onSubmit } = useAcaoFormulario(alterarMeuEmail);
  return (
    <form onSubmit={onSubmit} className="grid gap-5" aria-busy={pendente}>
      <p className="text-sm">
        E-mail atual: <span className="font-medium">{email}</span>
      </p>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="email-novo">Novo e-mail</Label>
          <Input id="email-novo" name="email" type="email" required maxLength={254} autoComplete="email" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email-senha">Senha atual (confirmação)</Label>
          <Input id="email-senha" name="senhaAtual" type="password" required autoComplete="current-password" />
        </div>
      </div>
      <BotaoSalvar pendente={pendente} rotulo="Alterar e-mail" />
    </form>
  );
}

export function FormSenha() {
  const { pendente, onSubmit } = useAcaoFormulario(alterarMinhaSenha);
  return (
    <form onSubmit={onSubmit} className="grid gap-5" aria-busy={pendente}>
      <div className="space-y-1.5 sm:max-w-sm">
        <Label htmlFor="senha-atual">Senha atual</Label>
        <Input id="senha-atual" name="senhaAtual" type="password" required autoComplete="current-password" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="senha-nova">Nova senha</Label>
          <Input
            id="senha-nova"
            name="novaSenha"
            type="password"
            required
            minLength={10}
            maxLength={128}
            autoComplete="new-password"
            aria-describedby="senha-nova-ajuda"
          />
          <p id="senha-nova-ajuda" className="text-xs text-muted-foreground">
            Ao menos 10 caracteres, diferente da atual.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha-confirmacao">Confirme a nova senha</Label>
          <Input id="senha-confirmacao" name="confirmacao" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Ao trocar a senha, as sessões abertas em outros navegadores e dispositivos são encerradas; esta continua ativa.
      </p>
      <BotaoSalvar pendente={pendente} rotulo="Alterar senha" />
    </form>
  );
}
