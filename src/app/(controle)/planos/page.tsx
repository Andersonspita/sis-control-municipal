import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, ListChecks } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { listarPlanos } from "@/lib/dados/planos";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Selo, SeloStatusPlano } from "@/components/selos-status";
import { ORIGEM_PLANO } from "@/lib/rotulos";
import { DialogoNovoPlano } from "./dialogo-novo-plano";

export const metadata: Metadata = { title: "Planos de ação" };

export default async function Planos() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const planos = await listarPlanos(ctx);

  return (
    <>
      <CabecalhoPagina
        titulo="Planos de ação"
        descricao="Motor único de planos 5W2H: ações geradas pela autoavaliação, determinações do Tribunal de Contas e planos avulsos."
        acoes={<DialogoNovoPlano />}
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Planos de ação</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Plano</th>
                <th scope="col" className="px-3 py-3 font-medium">Origem</th>
                <th scope="col" className="px-3 py-3 font-medium">Situação</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Ações</th>
                <th scope="col" className="px-3 py-3 font-medium">Executado</th>
                <th scope="col" className="px-5 py-3 font-medium">Vencidas</th>
              </tr>
            </thead>
            <tbody>
              {planos.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link href={`/planos/${p.id}`} className="font-medium text-primary hover:underline">
                      {p.titulo}
                    </Link>
                    {p.ciclo && (
                      <p className="text-xs text-muted-foreground">
                        Ciclo: {p.ciclo.nome} · <span className="font-mono">{p.ciclo.norma.codigo}</span>
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{ORIGEM_PLANO[p.origem]}</td>
                  <td className="px-3 py-3">
                    <SeloStatusPlano status={p.status} />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {p.concluidas}/{p.totalAcoes}
                    <span className="sr-only"> concluídas</span>
                  </td>
                  <td className="min-w-36 px-3 py-3">
                    {p.executado === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Progress value={p.executado} className="flex-1" aria-label={`Execução de ${p.titulo}`} />
                        <span className="w-10 text-right text-xs tabular-nums">{p.executado}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {p.vencidas > 0 ? (
                      <Selo icone={AlarmClock} tom="perigo">
                        {p.vencidas} {p.vencidas === 1 ? "vencida" : "vencidas"}
                      </Selo>
                    ) : (
                      <span className="text-muted-foreground">Nenhuma</span>
                    )}
                  </td>
                </tr>
              ))}
              {planos.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">
                    <ListChecks aria-hidden="true" className="mx-auto mb-2 size-8 opacity-60" />
                    Nenhum plano ainda. Gere um a partir de um ciclo de autoavaliação ou crie um plano avulso.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
