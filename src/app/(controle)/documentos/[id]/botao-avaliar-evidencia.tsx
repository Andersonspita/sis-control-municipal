"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { avaliarEvidenciaComIA } from "../../ia/actions";

export function BotaoAvaliarEvidencia({ respostaId, disponivel }: { respostaId: string; disponivel: boolean }) {
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      disabled={!disponivel || pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await avaliarEvidenciaComIA(respostaId);
          if (r.ok) toast.success(r.mensagem);
          else toast.error(r.erro);
        })
      }
    >
      {pendente ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Sparkles aria-hidden="true" />}
      Avaliar evidência com IA
    </Button>
  );
}
