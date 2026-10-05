import { FileImage, FileSpreadsheet, FileText, FileType } from "lucide-react";
import type { CategoriaArquivo } from "@/lib/arquivos";
import { cn } from "@/lib/utils";

const ICONES = {
  pdf: { icone: FileText, classe: "text-perigo" },
  imagem: { icone: FileImage, classe: "text-info" },
  planilha: { icone: FileSpreadsheet, classe: "text-sucesso" },
  documento: { icone: FileType, classe: "text-primary" },
  texto: { icone: FileText, classe: "text-muted-foreground" },
} satisfies Record<CategoriaArquivo, unknown>;

export function IconeArquivo({ categoria, className }: { categoria: CategoriaArquivo; className?: string }) {
  const { icone: Icone, classe } = ICONES[categoria];
  return <Icone aria-hidden="true" className={cn("size-4 shrink-0", classe, className)} />;
}
