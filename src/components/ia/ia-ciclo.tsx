"use client";

import Link from "next/link";
import { createContext, use, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { avaliarEvidenciaComIA } from "@/app/(controle)/ia/actions";

type ValorIACiclo = { cicloId: string; pendentes: Record<string, number>; disponivel: boolean; motivo: string | null };

const ContextoIACiclo = createContext<ValorIACiclo | null>(null);

/** Leva ao cartão do requisito as sugestões pendentes e a disponibilidade da IA, sem mudar as props da avaliação. */
export function ProvedorIACiclo({ children, ...valor }: ValorIACiclo & { children: React.ReactNode }) {
  return <ContextoIACiclo value={valor}>{children}</ContextoIACiclo>;
}

export function IndicadorIARequisito({ respostaId, temDocumentos, bloqueado }: { respostaId: string; temDocumentos: boolean; bloqueado: boolean }) {
  const ia = use(ContextoIACiclo);
  const [pendente, iniciar] = useTransition();
  if (!ia) return null;
  const n = ia.pendentes[respostaId] ?? 0;
  const podeAvaliar = temDocumentos && !bloqueado;
  if (!n && !podeAvaliar) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {n > 0 && (
        <Link
          href={`/ia?ciclo=${ia.cicloId}`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/15"
        >
          <Sparkles aria-hidden="true" className="size-3.5" />
          {n === 1 ? "Sugestão da IA pendente de revisão" : `${n} sugestões da IA pendentes de revisão`}
        </Link>
      )}
      {podeAvaliar && (
        <Button
          variant="outline"
          size="sm"
          disabled={!ia.disponivel || pendente}
          title={ia.motivo ?? "A IA diz se os anexos comprovam o requisito e o que falta"}
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
      )}
    </div>
  );
}
