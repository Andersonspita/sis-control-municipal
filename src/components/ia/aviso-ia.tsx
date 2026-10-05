import Link from "next/link";
import { Sparkles } from "lucide-react";

/** Explica por que a IA está indisponível; o link para a configuração só aparece para o administrador. */
export function AvisoIA({ motivo, admin, className }: { motivo: string | null; admin: boolean; className?: string }) {
  if (!motivo) return null;
  return (
    <p role="status" className={`flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm ${className ?? ""}`}>
      <Sparkles aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>
        Análise com IA indisponível: {motivo}{" "}
        {admin ? (
          <Link href="/admin/ia" className="font-medium text-primary underline-offset-4 hover:underline">
            Abrir a configuração da IA
          </Link>
        ) : (
          "Fale com o administrador do sistema."
        )}
      </span>
    </p>
  );
}
