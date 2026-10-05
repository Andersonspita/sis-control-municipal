"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Recarrega os dados da página a cada `intervaloMs` enquanto `ativo` (ex.: há análise na fila ou processando). */
export function AtualizarEnquanto({ ativo, intervaloMs = 8000 }: { ativo: boolean; intervaloMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!ativo) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervaloMs);
    return () => clearInterval(id);
  }, [ativo, intervaloMs, router]);
  return null;
}
