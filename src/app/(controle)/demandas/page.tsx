import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Filter, Paperclip, Plus } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PrioridadeDemanda, SituacaoCompleta } from "@/components/demandas/situacao";
import { formatarDataSimples, hojeComoDataSimples } from "@/lib/datas";
import { descricaoPrazo, numeroDemanda } from "@/lib/demandas";
import { PRIORIDADE, STATUS_DEMANDA } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { CLASSE_SELECT, filtrosDemandas, POR_PAGINA, whereDemandas } from "./filtros";

export const metadata: Metadata = { title: "Demandas" };

export default async function Demandas(props: PageProps<"/demandas">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const filtros = filtrosDemandas(await props.searchParams);
  const where = whereDemandas(filtros, hojeComoDataSimples());

  const [unidades, total, demandas] = await comCliente(ctx, (tx) =>
    Promise.all([
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
      tx.demanda.count({ where }),
      tx.demanda.findMany({
        where,
        orderBy: [{ ano: "desc" }, { numero: "desc" }],
        skip: (filtros.pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          numero: true,
          ano: true,
          assunto: true,
          prazo: true,
          prioridade: true,
          status: true,
          unidadeDestino: { select: { nome: true, sigla: true } },
          _count: { select: { documentos: true } },
        },
      }),
    ]),
  );
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = filtros.situacao || filtros.unidade || filtros.prioridade || filtros.vencidas || filtros.busca;

  const urlPagina = (p: number) => {
    const q = new URLSearchParams();
    if (filtros.situacao) q.set("situacao", filtros.situacao);
    if (filtros.unidade) q.set("unidade", filtros.unidade);
    if (filtros.prioridade) q.set("prioridade", filtros.prioridade);
    if (filtros.vencidas) q.set("vencidas", "1");
    if (filtros.busca) q.set("busca", filtros.busca);
    if (p > 1) q.set("pagina", String(p));
    const s = q.toString();
    return s ? `/demandas?${s}` : "/demandas";
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Demandas"
        descricao="Solicitações enviadas às unidades, com prazo, resposta e histórico completo da tramitação."
        acoes={
          <Link href="/demandas/nova" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden="true" />
            Nova demanda
          </Link>
        }
      />

      <Card className="mb-6">
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="busca">Buscar</Label>
              <Input id="busca" name="busca" defaultValue={filtros.busca} placeholder="Assunto ou número (ex.: 001/2026)" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="situacao">Situação</Label>
              <select id="situacao" name="situacao" defaultValue={filtros.situacao} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                <option value="ABERTAS">Em aberto</option>
                {Object.entries(STATUS_DEMANDA).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unidade">Unidade</Label>
              <select id="unidade" name="unidade" defaultValue={filtros.unidade} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.sigla ? `${u.sigla} — ${u.nome}` : u.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prioridade">Prioridade</Label>
              <select id="prioridade" name="prioridade" defaultValue={filtros.prioridade} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                {Object.entries(PRIORIDADE).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1">
              <label className="flex h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="vencidas"
                  value="1"
                  defaultChecked={filtros.vencidas}
                  className="size-4 rounded border-input accent-primary"
                />
                Só vencidas
              </label>
              <button type="submit" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Filter aria-hidden="true" />
                Filtrar
              </button>
              {temFiltro && (
                <Link href="/demandas" className={buttonVariants({ variant: "ghost", size: "lg" })}>
                  Limpar
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Demandas{temFiltro ? " filtradas" : ""}: {total} encontrada(s), página {filtros.pagina} de {paginas}
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Número</th>
                  <th scope="col" className="px-3 py-3 font-medium">Assunto</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Unidade</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Prioridade</th>
                  <th scope="col" className="px-3 py-3 font-medium">Prazo</th>
                  <th scope="col" className="px-5 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {demandas.map((d) => {
                  const prazo = descricaoPrazo(d);
                  return (
                    <tr key={d.id} className="border-b last:border-0 hover:bg-muted/40">
                      <td className="px-5 py-3 font-mono text-xs font-semibold whitespace-nowrap">{numeroDemanda(d.numero, d.ano)}</td>
                      <td className="px-3 py-3">
                        <Link href={`/demandas/${d.id}`} className="font-medium underline-offset-4 hover:underline">
                          {d.assunto}
                        </Link>
                        {d._count.documentos > 0 && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                            <Paperclip aria-hidden="true" className="size-3" />
                            {d._count.documentos}
                            <span className="sr-only"> anexo(s)</span>
                          </span>
                        )}
                        <span className="block text-xs text-muted-foreground md:hidden">
                          {d.unidadeDestino.sigla ?? d.unidadeDestino.nome}
                        </span>
                      </td>
                      <td className="hidden px-3 py-3 md:table-cell">
                        <span title={d.unidadeDestino.nome}>{d.unidadeDestino.sigla ?? d.unidadeDestino.nome}</span>
                      </td>
                      <td className="hidden px-3 py-3 lg:table-cell">
                        <PrioridadeDemanda prioridade={d.prioridade} />
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="tabular-nums">{formatarDataSimples(d.prazo)}</span>
                        {prazo && (
                          <span
                            className={cn(
                              "block text-xs",
                              prazo.tom === "perigo" ? "font-medium text-perigo" : "text-muted-foreground",
                            )}
                          >
                            {prazo.texto}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <SituacaoCompleta status={d.status} prazo={d.prazo} />
                      </td>
                    </tr>
                  );
                })}
                {demandas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      {temFiltro ? "Nenhuma demanda encontrada com esses filtros." : "Nenhuma demanda cadastrada."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {paginas > 1 && (
        <nav aria-label="Paginação" className="mt-4 flex items-center justify-between gap-4 text-sm">
          <p className="text-muted-foreground">
            {total} demandas · página {filtros.pagina} de {paginas}
          </p>
          <div className="flex gap-2">
            {filtros.pagina > 1 && (
              <Link href={urlPagina(filtros.pagina - 1)} className={buttonVariants({ variant: "outline" })}>
                <ChevronLeft aria-hidden="true" /> Anterior
              </Link>
            )}
            {filtros.pagina < paginas && (
              <Link href={urlPagina(filtros.pagina + 1)} className={buttonVariants({ variant: "outline" })}>
                Próxima <ChevronRight aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
