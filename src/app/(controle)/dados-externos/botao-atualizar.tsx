"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AtualizarEnquanto } from "@/components/ia/atualizar-enquanto";
import { sincronizarDadosExternos } from "./actions";

export function BotaoAtualizar({ processando, habilitado }: { processando: boolean; habilitado: boolean }) {
  const [pendente, iniciar] = useTransition();
  const ocupado = pendente || processando;

  return (
    <>
      <AtualizarEnquanto ativo={processando} intervaloMs={4000} />
      <Button
        size="lg"
        disabled={ocupado || !habilitado}
        onClick={() =>
          iniciar(async () => {
            const r = await sincronizarDadosExternos();
            if (r?.ok) toast.success(r.mensagem);
            else if (r?.erro) toast.error(r.erro);
          })
        }
      >
        {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
        {processando ? "Atualizando…" : "Atualizar dados"}
      </Button>
    </>
  );
}
