"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutGrid, Loader2, Save } from "lucide-react";
import { salvarBlocosPainel } from "@/app/actions/preferencias";
import { BLOCOS_PAINEL } from "@/lib/painel/blocos";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Escolha dos blocos exibidos no painel inicial (gravada no perfil do usuário). */
export function DialogoPersonalizarPainel({ visiveis }: { visiveis: string[] }) {
  const [aberto, setAberto] = useState(false);
  const [marcados, setMarcados] = useState<string[]>(visiveis);
  const [pendente, setPendente] = useState(false);

  function alternar(id: string, marcado: boolean) {
    setMarcados((atual) => (marcado ? [...atual, id] : atual.filter((x) => x !== id)));
  }

  async function salvar() {
    setPendente(true);
    try {
      const r = await salvarBlocosPainel(marcados);
      if (r?.erro) {
        toast.error(r.erro);
        return;
      }
      setAberto(false);
      toast.success(r?.mensagem ?? "Painel atualizado.");
    } finally {
      setPendente(false);
    }
  }

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setMarcados(visiveis);
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <LayoutGrid aria-hidden="true" /> Personalizar painel
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Personalizar painel</DialogTitle>
          <DialogDescription>
            Escolha o que aparece na página inicial. O que ficar desmarcado continua disponível na página de origem (indicada ao lado).
          </DialogDescription>
        </DialogHeader>
        <fieldset className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          <legend className="sr-only">Blocos do painel</legend>
          {BLOCOS_PAINEL.map((b) => (
            <label
              key={b.id}
              className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="checkbox"
                name="bloco"
                value={b.id}
                checked={marcados.includes(b.id)}
                onChange={(e) => alternar(b.id, e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{b.titulo}</span>
                <span className="block text-xs text-muted-foreground">{b.descricao}</span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{b.pagina.rotulo}</span>
            </label>
          ))}
        </fieldset>
        <DialogFooter>
          <Button type="button" variant="ghost" className="h-9" onClick={() => setMarcados(BLOCOS_PAINEL.map((b) => b.id))}>
            Marcar todos
          </Button>
          <Button type="button" className="h-9" onClick={salvar} disabled={pendente || !marcados.length}>
            {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Save aria-hidden="true" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
