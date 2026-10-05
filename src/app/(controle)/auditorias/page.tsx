import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, ChevronLeft, ChevronRight, ListChecks, Filter, Plus } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { listarAuditorias, rotuloUnidade } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SeloStatusAuditoria } from "@/components/auditorias/selos";
import { ETAPAS_AUDITORIA, numeroAuditoria } from "@/lib/auditorias";
import { formatarDataSimples } from "@/lib/datas";
import { STATUS_AUDITORIA, TIPO_AUDITORIA } from "@/lib/rotulos";
import { CLASSE_SELECT, filtrosAuditorias, POR_PAGINA } from "./filtros";

export const metadata: Metadata = { title: "Auditorias" };

export default async function Auditorias(props: PageProps<"/auditorias">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const filtros = filtrosAuditorias(await props.searchParams);
  const { unidades, total, auditorias, porStatus } = await listarAuditorias(ctx, filtros);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = filtros.status || filtros.tipo || filtros.unidade || filtros.ano || filtros.busca;

  const url = (mudancas: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const valores = { ...filtros, pagina: undefined, ...mudancas };
    for (const [k, v] of Object.entries(valores)) {
      if (v && !(k === "pagina" && Number(v) === 1)) q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `/auditorias?${s}` : "/auditorias";
  };

  return (
    <>
      <CabecalhoPagina
        titulo="Auditorias"
        descricao="Plano anual, planejamento, execução com checklists, achados no padrão do TCU e recomendações. Papéis de trabalho visíveis só para a controladoria."
        acoes={
          <div className="flex flex-wrap gap-2">
            <Link href="/auditorias/paai" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <CalendarRange aria-hidden="true" />
              Plano anual (PAAI)
            </Link>
            <Link href="/auditorias/modelos" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <ListChecks aria-hidden="true" />
              Modelos de checklist
            </Link>
            <Link href="/auditorias/nova" className={buttonVariants({ size: "lg" })}>
              <Plus aria-hidden="true" />
              Nova auditoria
            </Link>
          </div>
        }
      />

      <nav aria-label="Auditorias por etapa" className="mb-6 flex flex-wrap gap-2">
        {ETAPAS_AUDITORIA.map((s) => (
          <Link
            key={s}
            href={url({ status: filtros.status === s ? undefined : s })}
            aria-current={filtros.status === s ? "true" : undefined}
            className={buttonVariants({ variant: filtros.status === s ? "secondary" : "outline", size: "sm" })}
          >
            {STATUS_AUDITORIA[s]}
            <span className="tabular-nums text-muted-foreground">{porStatus[s] ?? 0}</span>
          </Link>
        ))}
      </nav>

      <Card className="mb-6">
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="busca">Buscar</Label>
              <Input id="busca" name="busca" defaultValue={filtros.busca} placeholder="Título ou número (ex.: 001/2026)" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Etapa</Label>
              <select id="status" name="status" defaultValue={filtros.status} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                <option value="ATIVAS">Em andamento</option>
                {Object.entries(STATUS_AUDITORIA).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tipo">Tipo</Label>
              <select id="tipo" name="tipo" defaultValue={filtros.tipo} className={CLASSE_SELECT}>
                <option value="">Todos</option>
                {Object.entries(TIPO_AUDITORIA).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="unidade">Unidade auditada</Label>
              <select id="unidade" name="unidade" defaultValue={filtros.unidade} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                {unidades.map((u) => (
                  <option key={u.id} value={u.id}>
                    {rotuloUnidade(u)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ano">Ano</Label>
              <Input id="ano" name="ano" type="number" min={2000} max={2100} defaultValue={filtros.ano || ""} className="h-9" />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1">
              <button type="submit" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Filter aria-hidden="true" />
                Filtrar
              </button>
              {temFiltro && (
                <Link href="/auditorias" className={buttonVariants({ variant: "ghost", size: "lg" })}>
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
                Auditorias{temFiltro ? " filtradas" : ""}: {total} encontrada(s), página {filtros.pagina} de {paginas}
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Número</th>
                  <th scope="col" className="px-3 py-3 font-medium">Auditoria</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Tipo</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Alcance</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Período previsto</th>
                  <th scope="col" className="px-5 py-3 font-medium">Etapa</th>
                </tr>
              </thead>
              <tbody>
                {auditorias.map((a) => (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs font-semibold whitespace-nowrap">{numeroAuditoria(a.numero, a.ano)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/auditorias/${a.id}`} className="font-medium underline-offset-4 hover:underline">
                        {a.titulo}
                      </Link>
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {a._count.achados} achado(s) · {a._count.demandas} solicitação(ões)
                        {a.itemPlanoId ? " · prevista no PAAI" : ""}
                      </span>
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">{TIPO_AUDITORIA[a.tipo]}</td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {a.unidade ? <span title={a.unidade.nome}>{a.unidade.sigla ?? a.unidade.nome}</span> : "Entidade inteira"}
                    </td>
                    <td className="hidden px-3 py-3 whitespace-nowrap lg:table-cell">
                      {a.inicioPrevisto ? formatarDataSimples(a.inicioPrevisto) : "—"}
                      {a.fimPrevisto ? ` a ${formatarDataSimples(a.fimPrevisto)}` : ""}
                    </td>
                    <td className="px-5 py-3">
                      <SeloStatusAuditoria status={a.status} />
                    </td>
                  </tr>
                ))}
                {auditorias.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      {temFiltro ? "Nenhuma auditoria encontrada com esses filtros." : "Nenhuma auditoria registrada."}
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
            {total} auditorias · página {filtros.pagina} de {paginas}
          </p>
          <div className="flex gap-2">
            {filtros.pagina > 1 && (
              <Link href={url({ pagina: filtros.pagina - 1 })} className={buttonVariants({ variant: "outline" })}>
                <ChevronLeft aria-hidden="true" /> Anterior
              </Link>
            )}
            {filtros.pagina < paginas && (
              <Link href={url({ pagina: filtros.pagina + 1 })} className={buttonVariants({ variant: "outline" })}>
                Próxima <ChevronRight aria-hidden="true" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </>
  );
}
