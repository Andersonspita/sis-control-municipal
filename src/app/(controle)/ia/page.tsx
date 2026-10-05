import type { Metadata } from "next";
import Link from "next/link";
import { after } from "next/server";
import { Filter } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { obterEstadoIA, processarAnalise, retomarFilaIA } from "@/lib/ia/analises";
import { listarAnalises, listarSugestoes } from "@/lib/ia/dados";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AvisoIA } from "@/components/ia/aviso-ia";
import { CartaoSugestao } from "@/components/ia/cartao-sugestao";
import { ListaAnalises } from "@/components/ia/lista-analises";
import { CLASSE_SELECT } from "../demandas/filtros";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Sugestões da IA" };

const usd = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" });

export default async function SugestoesIA(props: PageProps<"/ia">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const sp = await props.searchParams;
  const cicloId = typeof sp.ciclo === "string" && /^[0-9a-f-]{36}$/i.test(sp.ciclo) ? sp.ciclo : undefined;
  const revisadas = sp.ver === "revisadas";

  const contexto = { clienteId: ctx.clienteId, usuarioId: ctx.usuarioId, perfil: ctx.perfil };
  const aRetomar = await retomarFilaIA(contexto);
  if (aRetomar.length) {
    after(async () => {
      for (const id of aRetomar) await processarAnalise(contexto, id);
    });
  }

  const [estado, sugestoes, analises, ciclos] = await Promise.all([
    obterEstadoIA(),
    listarSugestoes(ctx, { cicloId, pendentes: !revisadas }),
    listarAnalises(ctx, { cicloId }, 15),
    comCliente(ctx, (tx) =>
      tx.cicloAvaliacao.findMany({
        orderBy: { criadoEm: "desc" },
        take: 50,
        select: { id: true, nome: true, norma: { select: { codigo: true } } },
      }),
    ),
  ]);

  const url = (ver: "pendentes" | "revisadas") => {
    const q = new URLSearchParams();
    if (cicloId) q.set("ciclo", cicloId);
    if (ver === "revisadas") q.set("ver", "revisadas");
    const s = q.toString();
    return s ? `/ia?${s}` : "/ia";
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Sugestões da IA"
        descricao="Respostas de requisitos sugeridas pela IA a partir dos documentos, com as citações conferidas no texto. Nenhuma sugestão é aplicada sem a revisão do controlador."
      />
      <AvisoIA motivo={estado.motivo} admin={ctx.usuario.adminHorizon} className="mb-6" />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <nav aria-label="Situação das sugestões" className="flex gap-1 rounded-lg bg-muted p-1 text-sm">
              {(["pendentes", "revisadas"] as const).map((v) => {
                const ativo = (v === "revisadas") === revisadas;
                return (
                  <Link
                    key={v}
                    href={url(v)}
                    aria-current={ativo ? "page" : undefined}
                    className={cn("rounded-md px-3 py-1.5", ativo ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
                  >
                    {v === "pendentes" ? "Pendentes de revisão" : "Revisadas"}
                  </Link>
                );
              })}
            </nav>
            <form method="get" className="flex items-end gap-2">
              {revisadas && <input type="hidden" name="ver" value="revisadas" />}
              <div className="space-y-1.5">
                <Label htmlFor="ciclo">Ciclo</Label>
                <select id="ciclo" name="ciclo" defaultValue={cicloId ?? ""} className={cn(CLASSE_SELECT, "min-w-56")}>
                  <option value="">Todos</option>
                  {ciclos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} · {c.norma.codigo}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Filter aria-hidden="true" /> Filtrar
              </button>
            </form>
          </div>

          {sugestoes.map((s) => (
            <CartaoSugestao key={s.id} sugestao={s} />
          ))}
          {sugestoes.length === 0 && (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {revisadas
                  ? "Nenhuma sugestão revisada ainda."
                  : "Nenhuma sugestão pendente. Use “Analisar com IA” no detalhe de um documento ou no ciclo de autoavaliação."}
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Análises recentes</CardTitle>
            <CardDescription>
              Quem pediu, modelo e custo estimado. Provedor: {estado.rotuloProvedor}. As análises rodam em segundo plano e a lista
              se atualiza sozinha enquanto houver alguma em andamento.
              {ctx.usuario.adminHorizon &&
                ` Gasto do mês (todos os clientes): ${usd.format(estado.gastoMesUsd)}${estado.limiteMensalUsd !== null ? ` de ${usd.format(estado.limiteMensalUsd)}` : ""}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ListaAnalises analises={analises} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
