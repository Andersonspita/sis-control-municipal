import type { Macrofuncao, TipoRequisito } from "@/generated/prisma/browser";
import { Badge } from "@/components/ui/badge";
import { MACROFUNCAO, TIPO_REQUISITO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

export type Classificacao = {
  tipo: TipoRequisito | null;
  peso: number;
  macrofuncoes: Macrofuncao[];
  periodicidade?: string | null;
};

/** Selos de tipo, peso, macrofunções e (opcional) periodicidade de um requisito. */
export function ClassificacaoRequisito({ tipo, peso, macrofuncoes, periodicidade, className }: Classificacao & { className?: string }) {
  return (
    <ul aria-label="Classificação do requisito" className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {tipo && (
        <li>
          <Badge variant="outline">{TIPO_REQUISITO[tipo]}</Badge>
        </li>
      )}
      <li>
        <Badge variant="outline" title="Peso no cálculo da conformidade">
          Peso {peso}
        </Badge>
      </li>
      {macrofuncoes.map((m) => (
        <li key={m}>
          <Badge variant="secondary">{MACROFUNCAO[m]}</Badge>
        </li>
      ))}
      {periodicidade && (
        <li>
          <Badge variant="ghost" className="text-muted-foreground">
            {periodicidade}
          </Badge>
        </li>
      )}
    </ul>
  );
}
