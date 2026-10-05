import { Download, Eye } from "lucide-react";
import { categoriaPorMime, formatarTamanho } from "@/lib/arquivos";
import { cn } from "@/lib/utils";
import { IconeArquivo } from "./icone-arquivo";

export type Anexo = { id: string; nome: string; tamanho: number; mimeType: string };

/** Lista de documentos com download pela rota autenticada /arquivos/[id] (registra o acesso na trilha). */
export function ListaAnexos({
  anexos,
  rotulo = "Anexos",
  vazio,
  className,
}: {
  anexos: Anexo[];
  rotulo?: string;
  vazio?: string;
  className?: string;
}) {
  if (anexos.length === 0) {
    return vazio ? <p className={cn("text-sm text-muted-foreground", className)}>{vazio}</p> : null;
  }
  return (
    <ul aria-label={rotulo} className={cn("divide-y rounded-lg border bg-card", className)}>
      {anexos.map((a) => {
        const categoria = categoriaPorMime(a.mimeType);
        const tamanho = formatarTamanho(a.tamanho);
        return (
          <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
            <IconeArquivo categoria={categoria} />
            <a
              href={`/arquivos/${a.id}`}
              download={a.nome}
              className="min-w-0 flex-1 truncate rounded-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`Baixar ${a.nome} (${tamanho})`}
            >
              {a.nome}
            </a>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{tamanho}</span>
            {(categoria === "pdf" || categoria === "imagem") && (
              <a
                href={`/arquivos/${a.id}?visualizar=1`}
                target="_blank"
                rel="noopener"
                className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label={`Visualizar ${a.nome} em nova aba`}
                title="Visualizar"
              >
                <Eye aria-hidden="true" className="size-4" />
              </a>
            )}
            <a
              href={`/arquivos/${a.id}`}
              download={a.nome}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label={`Baixar ${a.nome}`}
              title="Baixar"
            >
              <Download aria-hidden="true" className="size-4" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
