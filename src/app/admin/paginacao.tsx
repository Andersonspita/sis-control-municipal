import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export function Paginacao({
  total,
  pagina,
  porPagina,
  parametros,
  caminho,
}: {
  total: number;
  pagina: number;
  porPagina: number;
  parametros: Record<string, string>;
  caminho: string;
}) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const link = (n: number) => {
    const q = new URLSearchParams(Object.entries(parametros).filter(([, v]) => v));
    if (n > 1) q.set("pagina", String(n));
    const s = q.toString();
    return s ? `${caminho}?${s}` : caminho;
  };
  const classe = buttonVariants({ variant: "outline", size: "sm" });

  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        {total} {total === 1 ? "registro" : "registros"} · página {Math.min(pagina, paginas)} de {paginas}
      </span>
      <div className="flex gap-2">
        {pagina > 1 ? (
          <Link href={link(pagina - 1)} className={classe}>
            <ChevronLeft aria-hidden="true" /> Anterior
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            <ChevronLeft aria-hidden="true" /> Anterior
          </Button>
        )}
        {pagina < paginas ? (
          <Link href={link(pagina + 1)} className={classe}>
            Próxima <ChevronRight aria-hidden="true" />
          </Link>
        ) : (
          <Button variant="outline" size="sm" disabled>
            Próxima <ChevronRight aria-hidden="true" />
          </Button>
        )}
      </div>
    </nav>
  );
}
