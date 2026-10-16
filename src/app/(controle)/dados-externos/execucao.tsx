import type { AplicacaoMinima, ExecucaoRreo } from "@/lib/integracoes/tipos";
import { cn } from "@/lib/utils";
import { moeda, percentual } from "./componentes";

const MINIMOS = [
  { id: "educacao", rotulo: "Educação — manutenção e desenvolvimento do ensino", base: "CF, art. 212" },
  { id: "fundeb", rotulo: "FUNDEB — remuneração dos profissionais da educação", base: "Lei nº 14.113/2020, art. 26" },
  { id: "saude", rotulo: "Saúde — ações e serviços públicos de saúde", base: "LC nº 141/2012, art. 7º" },
] as const;

/** Barra do percentual aplicado com o marcador do mínimo legal (escala até 1,5× o mínimo). */
function BarraMinimo({ a, rotulo, base }: { a: AplicacaoMinima; rotulo: string; base: string }) {
  const escala = Math.max(a.minimo * 1.5, a.aplicado);
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / escala) * 100))}%`;
  const atende = a.aplicado >= a.minimo;
  return (
    <figure className="space-y-1.5">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{rotulo}</span>
        <span className={cn("font-semibold tabular-nums", atende ? "text-sucesso" : "text-perigo")}>
          {percentual(a.aplicado)} <span className="font-normal text-muted-foreground">/ mínimo {percentual(a.minimo)}</span>
        </span>
      </figcaption>
      <div className="relative h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className={cn("absolute inset-y-0 left-0 rounded-full", atende ? "bg-sucesso/70" : "bg-perigo/70")} style={{ width: pos(a.aplicado) }} />
        <div className="absolute inset-y-0 w-0.5 bg-foreground" style={{ left: pos(a.minimo) }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {a.valor != null && `${moeda(a.valor)} aplicados · `}
        {base}
      </p>
    </figure>
  );
}

/** Mínimos constitucionais de educação, FUNDEB e saúde (RREO Anexo 14). */
export function ConteudoMinimos({ execucao }: { execucao: ExecucaoRreo }) {
  const itens = MINIMOS.filter((m) => execucao[m.id]);
  if (!itens.length) return <p className="text-sm text-muted-foreground">O último RREO não informou os percentuais de educação e saúde.</p>;
  return (
    <div className="space-y-4">
      {itens.map((m) => (
        <BarraMinimo key={m.id} a={execucao[m.id]!} rotulo={m.rotulo} base={m.base} />
      ))}
      {!execucao.final && (
        <p className="text-xs text-muted-foreground">Percentuais acumulados até o bimestre; o mínimo é verificado no encerramento do exercício.</p>
      )}
    </div>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: number | null; destaque?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <dt className="text-muted-foreground">{rotulo}</dt>
      <dd className={cn("tabular-nums", destaque && "font-semibold")}>{valor != null ? moeda(valor) : "—"}</dd>
    </div>
  );
}

/** Execução orçamentária e restos a pagar (RREO Anexo 14). */
export function ConteudoExecucao({ execucao }: { execucao: ExecucaoRreo }) {
  const o = execucao.orcamento;
  const realizacao = o.receitaPrevista && o.receitaRealizada != null ? (o.receitaRealizada / o.receitaPrevista) * 100 : null;
  const rap = execucao.restosAPagar;
  return (
    <div className="grid gap-4 text-sm sm:grid-cols-2">
      <div>
        <p className="mb-1 font-medium">Orçamento até o bimestre</p>
        <dl>
          <Linha rotulo="Receita prevista (atualizada)" valor={o.receitaPrevista} />
          <Linha rotulo="Receita realizada" valor={o.receitaRealizada} destaque />
          <Linha rotulo="Despesa empenhada" valor={o.despesaEmpenhada} />
          <Linha rotulo="Despesa liquidada" valor={o.despesaLiquidada} />
          <Linha rotulo="Despesa paga" valor={o.despesaPaga} />
          <Linha rotulo={(o.superavit ?? 0) < 0 ? "Déficit orçamentário" : "Superávit orçamentário"} valor={o.superavit} destaque />
        </dl>
        {realizacao !== null && <p className="mt-1 text-xs text-muted-foreground">{percentual(realizacao)} da receita prevista já realizada.</p>}
      </div>
      <div>
        <p className="mb-1 font-medium">Restos a pagar</p>
        <dl>
          <Linha rotulo="Inscritos" valor={rap.inscritos} />
          <Linha rotulo="Pagos até o bimestre" valor={rap.pagos} />
          <Linha rotulo="Saldo a pagar" valor={rap.saldo} destaque />
        </dl>
      </div>
    </div>
  );
}
