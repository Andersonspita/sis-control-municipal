"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CircleCheck, CircleX, Loader2, PlugZap, Save, Trash2 } from "lucide-react";
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
import { removerChaveIA, salvarConfigIA, testarConexaoIA, type EstadoTeste } from "./actions";

type ConfigEditavel = {
  habilitada: boolean;
  temChave: boolean;
  modeloTexto: string;
  modeloEmbeddings: string;
  limiteMensalUsd: string;
};

export function FormConfigIA({
  config,
  sugestoesTexto,
  sugestoesEmbeddings,
  bloqueado,
}: {
  config: ConfigEditavel;
  sugestoesTexto: string[];
  sugestoesEmbeddings: string[];
  bloqueado: boolean;
}) {
  const [teste, setTeste] = useState<EstadoTeste | null>(null);
  const [testando, iniciarTeste] = useTransition();
  const { pendente, formRef, onSubmit } = useAcaoFormulario(salvarConfigIA, { aoConcluir: () => setTeste(null) });

  function testar() {
    if (!formRef.current) return;
    const dados = new FormData(formRef.current);
    iniciarTeste(async () => {
      const r = await testarConexaoIA(dados);
      setTeste(r);
      if (r.ok) toast.success("Conexão com a OpenAI funcionando.");
      else toast.error(r.mensagem);
    });
  }

  return (
    <div className="grid gap-6">
      <form ref={formRef} onSubmit={onSubmit} className="grid gap-5" aria-busy={pendente}>
        <label className="flex w-fit cursor-pointer items-center gap-3">
          <span className="relative inline-flex">
            <input
              type="checkbox"
              role="switch"
              name="habilitada"
              defaultChecked={config.habilitada}
              disabled={bloqueado}
              className="peer sr-only"
            />
            <span
              aria-hidden="true"
              className="h-5 w-9 rounded-full bg-input transition-colors peer-checked:bg-primary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-disabled:opacity-50"
            />
            <span
              aria-hidden="true"
              className="absolute top-0.5 left-0.5 size-4 rounded-full bg-background shadow-sm transition-transform peer-checked:translate-x-4"
            />
          </span>
          <span className="text-sm font-medium">IA habilitada</span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="ia-chave">Chave da API da OpenAI</Label>
          <Input
            id="ia-chave"
            name="chave"
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            placeholder={config.temChave ? "Deixe em branco para manter a chave atual" : "sk-..."}
            disabled={bloqueado}
            className="font-mono"
            aria-describedby="ia-chave-ajuda"
          />
          <p id="ia-chave-ajuda" className="text-xs text-muted-foreground">
            Gravada cifrada no banco; depois de salva, só os 4 últimos caracteres ficam visíveis.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ia-modelo-texto">Modelo principal de texto</Label>
            <Input
              id="ia-modelo-texto"
              name="modeloTexto"
              list="ia-sugestoes-texto"
              defaultValue={config.modeloTexto}
              required
              disabled={bloqueado}
              className="font-mono"
            />
            <datalist id="ia-sugestoes-texto">
              {sugestoesTexto.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ia-modelo-embeddings">Modelo de embeddings</Label>
            <Input
              id="ia-modelo-embeddings"
              name="modeloEmbeddings"
              list="ia-sugestoes-embeddings"
              defaultValue={config.modeloEmbeddings}
              required
              disabled={bloqueado}
              className="font-mono"
            />
            <datalist id="ia-sugestoes-embeddings">
              {sugestoesEmbeddings.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor="ia-limite">Limite mensal de gasto (US$, opcional)</Label>
          <Input
            id="ia-limite"
            name="limiteMensalUsd"
            inputMode="decimal"
            placeholder="Ex.: 50,00"
            defaultValue={config.limiteMensalUsd}
            disabled={bloqueado}
            aria-describedby="ia-limite-ajuda"
          />
          <p id="ia-limite-ajuda" className="text-xs text-muted-foreground">
            Em dólares, moeda em que a OpenAI cobra. Em branco, sem limite.
          </p>
        </div>

        <div role="status" aria-live="polite">
          {teste && (
            <p className={`flex items-start gap-2 text-sm ${teste.ok ? "text-foreground" : "text-destructive"}`}>
              {teste.ok ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              <span>
                {teste.mensagem}
                {teste.aviso && <span className="block text-muted-foreground">{teste.aviso}</span>}
              </span>
            </p>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" size="lg" variant="outline" onClick={testar} disabled={testando}>
            {testando ? <Loader2 className="animate-spin" aria-hidden="true" /> : <PlugZap aria-hidden="true" />}
            Testar conexão
          </Button>
          <Button type="submit" size="lg" disabled={pendente || bloqueado}>
            {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
            Salvar configuração
          </Button>
        </div>
      </form>

      {config.temChave && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-sm text-muted-foreground">Apaga a chave cadastrada e desabilita a IA.</p>
          <DialogoRemoverChave />
        </div>
      )}
    </div>
  );
}

function DialogoRemoverChave() {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(removerChaveIA, { aoConcluir: () => setAberto(false) });

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Trash2 aria-hidden="true" />
        Remover chave
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Remover a chave da OpenAI?</DialogTitle>
            <DialogDescription>
              A chave cifrada é apagada do banco e a IA fica desabilitada até que uma nova chave seja cadastrada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" variant="destructive" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" aria-hidden="true" />}
              Remover chave
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
