"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { anexarEvidencias } from "@/app/actions/evidencias";
import { CampoAnexos } from "./campo-anexos";
import { ListaAnexos, type Anexo } from "./lista-anexos";

/**
 * Evidências em arquivo de uma resposta da autoavaliação ou de uma ação do plano.
 * Não usa <form> porque pode ficar dentro de outro formulário; o envio é imediato e independente do "Salvar".
 */
export function Evidencias({
  alvo,
  id,
  iniciais,
  bloqueado = false,
}: {
  alvo: "resposta" | "acao";
  id: string;
  iniciais: Anexo[];
  bloqueado?: boolean;
}) {
  const [documentos, setDocumentos] = useState(iniciais);
  const [selecionados, setSelecionados] = useState<File[]>([]);
  const [chaveCampo, setChaveCampo] = useState(0);
  const [enviando, iniciar] = useTransition();

  function enviar() {
    if (selecionados.length === 0) return;
    const fd = new FormData();
    fd.set("alvo", alvo);
    fd.set("id", id);
    selecionados.forEach((a) => fd.append("anexos", a));
    iniciar(async () => {
      const r = await anexarEvidencias(fd);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(selecionados.length === 1 ? "Evidência anexada." : `${selecionados.length} evidências anexadas.`);
      setDocumentos(r.documentos);
      setSelecionados([]);
      setChaveCampo((k) => k + 1);
    });
  }

  return (
    <div className="space-y-2">
      <ListaAnexos
        anexos={documentos}
        rotulo="Evidências em arquivo"
        vazio={bloqueado ? "Nenhuma evidência em arquivo." : undefined}
      />
      {!bloqueado && (
        <>
          <CampoAnexos
            key={chaveCampo}
            name="evidencias"
            rotulo="Anexar evidências"
            disabled={enviando}
            aoMudar={setSelecionados}
          />
          {selecionados.length > 0 && (
            <Button type="button" size="sm" variant="outline" onClick={enviar} disabled={enviando}>
              {enviando ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Upload aria-hidden="true" />}
              Anexar {selecionados.length === 1 ? "arquivo" : `${selecionados.length} arquivos`}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
