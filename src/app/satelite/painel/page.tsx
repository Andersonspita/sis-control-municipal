import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CalendarClock, CheckCircle2, Inbox, MessageSquareReply, type LucideIcon } from "lucide-react";
import { exigirContexto } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SituacaoCompleta } from "@/components/demandas/situacao";
import { formatarDataSimples, hojeComoDataSimples, somarDias } from "@/lib/datas";
import { descricaoPrazo, numeroDemanda, STATUS_ABERTOS, STATUS_AGUARDANDO_CONTROLE, STATUS_FINAIS } from "@/lib/demandas";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Painel da unidade" };

function Contador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
  tom,
}: {
  rotulo: string;
  valor: number;
  detalhe: string;
  icone: LucideIcon;
  tom: "primary" | "alerta" | "perigo" | "info" | "sucesso";
}) {
  const cores = {
    primary: "bg-primary/10 text-primary",
    alerta: "bg-alerta/15 text-alerta",
    perigo: "bg-perigo/12 text-perigo",
    info: "bg-info/12 text-info",
    sucesso: "bg-sucesso/12 text-sucesso",
  };
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{rotulo}</p>
          <p className="font-heading text-3xl font-semibold tabular-nums">{valor}</p>
          <p className="text-xs text-muted-foreground">{detalhe}</p>
        </div>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", valor > 0 ? cores[tom] : "bg-muted text-muted-foreground")}>
          <Icone aria-hidden="true" className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function PainelUnidade() {
  const ctx = await exigirContexto(["SATELITE"]);
  const hoje = hojeComoDataSimples();
  const emSeteDias = somarDias(hoje, 7);

  // Tudo filtrado pelo RLS ao escopo do satélite.
  const [unidades, abertas, aVencer, vencidas, respondidas, concluidas, prazos] = await comCliente(ctx, (tx) =>
    Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
      tx.demanda.count({ where: { status: { in: STATUS_ABERTOS } } }),
      tx.demanda.count({ where: { status: { in: STATUS_ABERTOS }, prazo: { gte: hoje, lte: emSeteDias } } }),
      tx.demanda.count({ where: { status: { notIn: STATUS_FINAIS }, prazo: { lt: hoje } } }),
      tx.demanda.count({ where: { status: { in: STATUS_AGUARDANDO_CONTROLE } } }),
      tx.demanda.count({ where: { status: "CONCLUIDA" } }),
      tx.demanda.findMany({
        where: { status: { in: STATUS_ABERTOS } },
        orderBy: [{ prazo: "asc" }, { numero: "asc" }],
        take: 30,
        select: {
          id: true,
          numero: true,
          ano: true,
          assunto: true,
          prazo: true,
          status: true,
          unidadeDestino: { select: { nome: true, sigla: true } },
        },
      }),
    ]),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Painel da unidade"
        descricao={
          unidades.length
            ? `Situação das demandas de ${unidades.map((u) => u.sigla ?? u.nome).join(", ")}.`
            : "Nenhuma unidade vinculada ao seu acesso. Procure a controladoria."
        }
      />

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Contador rotulo="Em aberto" valor={abertas} detalhe="Ainda não concluídas" icone={Inbox} tom="primary" />
        <Contador rotulo="A vencer em 7 dias" valor={aVencer} detalhe="Prazo até a próxima semana" icone={CalendarClock} tom="alerta" />
        <Contador rotulo="Vencidas" valor={vencidas} detalhe="Prazo expirado" icone={AlarmClock} tom="perigo" />
        <Contador rotulo="Respondidas" valor={respondidas} detalhe="Em análise pela controladoria" icone={MessageSquareReply} tom="info" />
        <Contador rotulo="Concluídas" valor={concluidas} detalhe="Respostas aceitas" icone={CheckCircle2} tom="sucesso" />
      </section>

      <Card className="mt-6">
        <CardHeader>
          <h2 className="font-heading text-base font-medium">Prazos</h2>
          <p className="text-sm text-muted-foreground">Demandas em aberto, da mais urgente para a menos urgente.</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Prazos das demandas em aberto</caption>
              <thead>
                <tr className="border-y text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Prazo</th>
                  <th scope="col" className="px-3 py-3 font-medium">Demanda</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium sm:table-cell">Unidade</th>
                  <th scope="col" className="px-4 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {prazos.map((d) => {
                  const prazo = descricaoPrazo(d);
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="tabular-nums">{formatarDataSimples(d.prazo)}</span>
                        {prazo && (
                          <span className={cn("block text-xs", prazo.tom === "perigo" ? "font-medium text-perigo" : "text-muted-foreground")}>
                            {prazo.texto}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="mr-2 font-mono text-xs font-semibold text-muted-foreground">{numeroDemanda(d.numero, d.ano)}</span>
                        <Link href={`/satelite/demandas/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                          {d.assunto}
                        </Link>
                      </td>
                      <td className="hidden px-3 py-3 sm:table-cell">{d.unidadeDestino.sigla ?? d.unidadeDestino.nome}</td>
                      <td className="px-4 py-3">
                        <SituacaoCompleta status={d.status} prazo={d.prazo} />
                      </td>
                    </tr>
                  );
                })}
                {prazos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      Nenhuma demanda em aberto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
