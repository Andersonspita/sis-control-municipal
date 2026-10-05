import { CircleAlert, CircleCheck, Clock, Loader2 } from "lucide-react";
import type { StatusAnaliseIA, TipoAnaliseIA } from "@/generated/prisma/client";
import type { listarAnalises } from "@/lib/ia/dados";

export const TIPO_ANALISE: Record<TipoAnaliseIA, string> = {
  COMPARAR_NORMA: "Documento × norma",
  AVALIAR_EVIDENCIA: "Avaliação de evidência",
};

const STATUS: Record<StatusAnaliseIA, { rotulo: string; icone: typeof Clock; classe: string }> = {
  PENDENTE: { rotulo: "Na fila", icone: Clock, classe: "text-muted-foreground" },
  PROCESSANDO: { rotulo: "Processando", icone: Loader2, classe: "text-info" },
  CONCLUIDO: { rotulo: "Concluída", icone: CircleCheck, classe: "text-sucesso" },
  ERRO: { rotulo: "Erro", icone: CircleAlert, classe: "text-perigo" },
};

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" });
const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function ListaAnalises({ analises }: { analises: Awaited<ReturnType<typeof listarAnalises>> }) {
  if (!analises.length) return <p className="text-sm text-muted-foreground">Nenhuma análise solicitada ainda.</p>;
  return (
    <ul className="space-y-3 text-sm">
      {analises.map((a) => {
        const s = STATUS[a.status];
        const Icone = s.icone;
        return (
          <li key={a.id} className="border-b pb-3 last:border-0 last:pb-0">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{TIPO_ANALISE[a.tipo]}</span>
              <span className={`inline-flex items-center gap-1 text-xs font-medium ${s.classe}`}>
                <Icone aria-hidden="true" className={`size-3.5 ${a.status === "PROCESSANDO" ? "animate-spin" : ""}`} /> {s.rotulo}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {a.solicitadoPor} · {data.format(a.criadoEm)}
              {a.provedor === "falso" ? " · simulação" : ` · ${a.modelo ?? "—"} · ${usd.format(a.custoUsd)}`}
            </p>
            {a.status === "CONCLUIDO" && (
              <p className="text-xs text-muted-foreground">
                {a.resumo.sugestoes ?? 0} sugestão(ões){a.pendentes ? `, ${a.pendentes} pendente(s)` : ""}
                {a.resumo.semCitacao ? ` · ${a.resumo.semCitacao} sem citação conferida (descartadas)` : ""}
              </p>
            )}
            {a.erro && <p className="text-xs text-perigo">{a.erro}</p>}
          </li>
        );
      })}
    </ul>
  );
}
