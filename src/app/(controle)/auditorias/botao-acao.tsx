"use client";

import { useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EstadoAcao } from "@/lib/acoes";

/** Executa uma server action já vinculada aos ids (via `.bind`) com confirmação opcional e aviso do resultado. */
export function BotaoAcao({
  acao,
  confirmar,
  children,
  variant = "outline",
  size = "sm",
  rotulo,
}: {
  acao: () => Promise<EstadoAcao>;
  confirmar?: string;
  children: ReactNode;
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "sm" | "default" | "lg" | "icon-sm";
  rotulo?: string;
}) {
  const [pendente, iniciar] = useTransition();
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={pendente}
      aria-label={rotulo}
      title={rotulo}
      onClick={() => {
        if (confirmar && !window.confirm(confirmar)) return;
        iniciar(async () => {
          const r = await acao();
          if (r?.erro) toast.error(r.erro);
          else if (r?.ok) toast.success(r.mensagem ?? "Operação concluída.");
        });
      }}
    >
      {pendente && <Loader2 aria-hidden="true" className="animate-spin" />}
      {children}
    </Button>
  );
}
