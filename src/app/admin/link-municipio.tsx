"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { caminhoAcessoMunicipio } from "@/lib/municipios";

/** Caminho do link de acesso do município com botão para copiar o endereço completo. */
export function LinkMunicipio({ slug, nome }: { slug: string; nome: string }) {
  const caminho = caminhoAcessoMunicipio(slug);

  async function copiar() {
    const url = `${window.location.origin}${caminho}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`Link de ${nome} copiado.`, { description: url });
    } catch {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.", { description: url });
    }
  }

  return (
    <span className="inline-flex items-center gap-1">
      <a href={caminho} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline-offset-2 hover:underline">
        {caminho}
      </a>
      <Button type="button" variant="ghost" size="icon-xs" onClick={copiar} aria-label={`Copiar link de acesso de ${nome}`} title="Copiar link">
        <Copy aria-hidden="true" />
      </Button>
    </span>
  );
}
