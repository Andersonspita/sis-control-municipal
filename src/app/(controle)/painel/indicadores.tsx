import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export type Tom = "neutro" | "alerta" | "perigo" | "sucesso";

const TOM_ICONE: Record<Tom, string> = {
  neutro: "bg-primary/10 text-primary",
  alerta: "bg-alerta/15 text-alerta",
  perigo: "bg-perigo/12 text-perigo",
  sucesso: "bg-sucesso/12 text-sucesso",
};

/** Indicador compacto usado dentro dos blocos do painel. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom = "neutro",
  href,
}: {
  rotulo: string;
  valor: React.ReactNode;
  detalhe?: React.ReactNode;
  icone: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  tom?: Tom;
  href?: string;
}) {
  const conteudo = (
    <>
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-muted-foreground">{rotulo}</p>
        <p className="font-heading text-2xl font-semibold tabular-nums">{valor}</p>
        {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
      </div>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md", TOM_ICONE[tom])}>
        <Icone aria-hidden className="size-4" />
      </span>
    </>
  );
  const classe = "flex h-full items-start justify-between gap-3 rounded-lg border px-4 py-3";
  return (
    <li>
      {href ? (
        <Link href={href} className={cn(classe, "outline-none transition-colors hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50")}>
          {conteudo}
        </Link>
      ) : (
        <div className={classe}>{conteudo}</div>
      )}
    </li>
  );
}

export function GradeIndicadores({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", className)}>{children}</ul>;
}

export function LinkPagina({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
      {children} <ArrowRight aria-hidden="true" className="size-4" />
    </Link>
  );
}
