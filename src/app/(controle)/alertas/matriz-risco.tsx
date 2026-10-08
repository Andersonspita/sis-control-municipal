import { VISUAL_GRAVIDADE } from "@/components/alertas/selos";
import { classificarRisco, ESCALA, IMPACTO, NIVEL_RISCO, PROBABILIDADE } from "@/lib/risco";
import { cn } from "@/lib/utils";

/** Matriz probabilidade × impacto com a quantidade de situações em aberto em cada célula. */
export function MatrizRisco({ matriz }: { matriz: number[][] }) {
  const linhas = [...ESCALA].reverse();
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[22rem] border-separate border-spacing-1 text-xs">
        <caption className="sr-only">
          Situações em aberto por probabilidade (linhas, da maior para a menor) e impacto (colunas, do menor para o maior)
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-24 text-left font-medium text-muted-foreground">
              Probabilidade
            </th>
            {ESCALA.map((i) => (
              <th key={i} scope="col" className="font-medium text-muted-foreground" title={IMPACTO[i]}>
                {i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((p) => (
            <tr key={p}>
              <th scope="row" className="text-left font-medium text-muted-foreground" title={PROBABILIDADE[p]}>
                {p} <span className="hidden font-normal sm:inline">· {PROBABILIDADE[p]}</span>
              </th>
              {ESCALA.map((i) => {
                const nivel = classificarRisco(p, i);
                const n = matriz[p - 1]?.[i - 1] ?? 0;
                return (
                  <td
                    key={i}
                    className={cn(
                      "h-9 rounded-md text-center font-heading text-sm font-semibold tabular-nums",
                      VISUAL_GRAVIDADE[nivel].celula,
                      n === 0 && "font-normal opacity-50",
                    )}
                    aria-label={`Probabilidade ${p}, impacto ${i} (${NIVEL_RISCO[nivel]}): ${n} situação(ões)`}
                  >
                    {n}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td />
            <td colSpan={5} className="pt-1 text-center text-muted-foreground">
              Impacto
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
