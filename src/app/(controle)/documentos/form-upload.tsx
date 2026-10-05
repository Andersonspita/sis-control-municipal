"use client";

import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoAnexos } from "@/components/anexos/campo-anexos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { enviarDocumentosAvulsos } from "./actions";

export function FormUpload() {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(enviarDocumentosAvulsos);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
      <CampoAnexos rotulo="Arquivos" obrigatorio disabled={pendente} />
      <Button type="submit" size="lg" className="w-full" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
        Enviar
      </Button>
    </form>
  );
}
