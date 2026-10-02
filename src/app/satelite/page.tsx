import type { Metadata } from "next";
import { CalendarClock } from "lucide-react";
import { diasAte, formatarDataSimples } from "@/lib/datas";
import { exigirContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PRIORIDADE, STATUS_DEMANDA } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Minhas demandas" };

function prazoTexto(prazo: Date) {
  const dias = diasAte(prazo);
  if (dias < 0) return { texto: `vencida há ${-dias} dia(s)`, tom: "text-perigo" };
  if (dias === 0) return { texto: "vence hoje", tom: "text-alerta" };
  return { texto: `${dias} dia(s) restantes`, tom: dias <= 3 ? "text-alerta" : "text-muted-foreground" };
}

export default async function MinhasDemandas() {
  const ctx = await exigirContexto(["SATELITE"]);
  const demandas = await comCliente(ctx, (tx) =>
    tx.demanda.findMany({
      orderBy: [{ status: "asc" }, { prazo: "asc" }],
      select: {
        id: true,
        numero: true,
        ano: true,
        assunto: true,
        descricao: true,
        prazo: true,
        prioridade: true,
        status: true,
        unidadeDestino: { select: { nome: true, sigla: true } },
      },
    }),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Minhas demandas"
        descricao="Solicitações da controladoria encaminhadas à sua unidade. Responda dentro do prazo e anexe os documentos pedidos."
      />
      {demandas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">Nenhuma demanda para a sua unidade.</CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {demandas.map((d) => {
            const prazo = prazoTexto(d.prazo);
            const encerrada = d.status === "CONCLUIDA" || d.status === "CANCELADA";
            return (
              <li key={d.id}>
                <Card>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-muted-foreground">
                        Nº {String(d.numero).padStart(3, "0")}/{d.ano}
                      </span>
                      <Badge variant={d.status === "DEVOLVIDA" ? "destructive" : "secondary"}>{STATUS_DEMANDA[d.status]}</Badge>
                      {(d.prioridade === "ALTA" || d.prioridade === "URGENTE") && (
                        <Badge variant="outline">Prioridade {PRIORIDADE[d.prioridade].toLowerCase()}</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{d.unidadeDestino.sigla ?? d.unidadeDestino.nome}</span>
                    </div>
                    <div className="space-y-1">
                      <p className="font-heading text-base font-semibold">{d.assunto}</p>
                      <p className="text-sm text-muted-foreground">{d.descricao}</p>
                    </div>
                    <p className={cn("flex items-center gap-1.5 text-sm", encerrada ? "text-muted-foreground" : prazo.tom)}>
                      <CalendarClock aria-hidden="true" className="size-4" />
                      Prazo {formatarDataSimples(d.prazo)}
                      {!encerrada && ` · ${prazo.texto}`}
                    </p>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
