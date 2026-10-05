import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, db } from "@/lib/db";
import { listarCiclos } from "@/lib/dados/autoavaliacao";
import { formatarPercentual } from "@/lib/dados/conformidade";
import { formatarDataSimples, hojeComoDataSimples } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { SeloStatusCiclo } from "@/components/selos-status";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { DialogoAbrirCiclo } from "./dialogo-abrir-ciclo";

export const metadata: Metadata = { title: "Autoavaliação" };

export default async function Autoavaliacao() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const [ciclos, normas, unidades] = await Promise.all([
    listarCiclos(ctx),
    db.norma.findMany({
      where: { ativo: true },
      orderBy: { codigo: "asc" },
      select: {
        id: true,
        codigo: true,
        titulo: true,
        _count: { select: { requisitos: { where: { avaliavel: true, tiposEntidade: { has: ctx.cliente.tipo } } } } },
      },
    }),
    comCliente(ctx, (tx) =>
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
    ),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Autoavaliação"
        descricao={`Ciclos de avaliação dos requisitos das normas aplicáveis a ${TIPO_CLIENTE[ctx.cliente.tipo].toLowerCase()}. Cada norma escolhida gera um ciclo próprio.`}
        acoes={
          <DialogoAbrirCiclo
            normas={normas.map((n) => ({ id: n.id, codigo: n.codigo, titulo: n.titulo, requisitos: n._count.requisitos }))}
            unidades={unidades}
            hoje={hojeComoDataSimples().toISOString().slice(0, 10)}
            anoAtual={new Date().getFullYear()}
          />
        }
      />

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Ciclos de autoavaliação</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Ciclo</th>
                <th scope="col" className="px-3 py-3 font-medium">Norma</th>
                <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Alcance</th>
                <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Período</th>
                <th scope="col" className="px-3 py-3 font-medium">Situação</th>
                <th scope="col" className="px-3 py-3 text-right font-medium">Conformidade</th>
                <th scope="col" className="px-5 py-3 font-medium">Progresso</th>
              </tr>
            </thead>
            <tbody>
              {ciclos.map((c) => {
                const { total, avaliados } = c.conformidade;
                const progresso = total ? Math.round((avaliados / total) * 100) : 0;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <Link href={`/autoavaliacao/${c.id}`} className="font-medium text-primary hover:underline">
                        {c.nome}
                      </Link>
                      {c._count.planos > 0 && <p className="text-xs text-muted-foreground">Com plano de ação</p>}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-xs font-semibold" title={c.norma.titulo}>
                        {c.norma.codigo}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground lg:table-cell">
                      {c.unidade ? (c.unidade.sigla ? `${c.unidade.sigla} — ${c.unidade.nome}` : c.unidade.nome) : "Entidade inteira"}
                    </td>
                    <td className="hidden px-3 py-3 whitespace-nowrap text-muted-foreground tabular-nums md:table-cell">
                      {formatarDataSimples(c.dataInicio)}
                      {c.dataFim ? ` a ${formatarDataSimples(c.dataFim)}` : " — em aberto"}
                    </td>
                    <td className="px-3 py-3">
                      <SeloStatusCiclo status={c.status} />
                    </td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{formatarPercentual(c.conformidade.indice)}</td>
                    <td className="min-w-40 px-5 py-3">
                      <Progress value={progresso} aria-label={`Progresso de respostas de ${c.nome} (${c.norma.codigo})`} />
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {avaliados} de {total} avaliados
                      </p>
                    </td>
                  </tr>
                );
              })}
              {ciclos.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">
                    <ClipboardCheck aria-hidden="true" className="mx-auto mb-2 size-8 opacity-60" />
                    Nenhum ciclo aberto. Use “Abrir ciclo” para começar a autoavaliação.
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
