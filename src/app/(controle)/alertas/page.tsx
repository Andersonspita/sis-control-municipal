import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, ChevronLeft, ChevronRight, EyeOff, FileDown, Filter, Paperclip, Plus, ShieldAlert, Siren } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { listarSituacoes, numeroSituacao } from "@/lib/dados/alertas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { SeloGravidade, SeloStatusSituacao, VISUAL_GRAVIDADE } from "@/components/alertas/selos";
import { SeloVencida } from "@/components/selos-status";
import { NIVEIS_RISCO, NIVEL_RISCO } from "@/lib/risco";
import { ORIGEM_SITUACAO, STATUS_SITUACAO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { PDF_RELATORIO } from "@/lib/relatorios/urls";
import { carregarDadosExternos } from "@/lib/dados/integracoes";
import { calcularAlertasFiscais } from "@/lib/integracoes/alertas-fiscais";
import { preferenciasDaPagina } from "@/lib/preferencias";
import { ListaAlertasFiscais } from "@/components/alertas/alertas-fiscais";
import { BlocoRecolhivel, ProvedorRecolhiveis } from "@/components/recolhivel";
import { CLASSE_SELECT, filtrosSituacoes, POR_PAGINA } from "./filtros";
import { MatrizRisco } from "./matriz-risco";

export const metadata: Metadata = { title: "Alertas" };

export default async function Alertas(props: PageProps<"/alertas">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const filtros = filtrosSituacoes(await props.searchParams);
  const [{ unidades, total, situacoes, painel }, externos, pref] = await Promise.all([
    listarSituacoes(ctx, filtros),
    carregarDadosExternos(ctx),
    preferenciasDaPagina(ctx.usuarioId, "alertas"),
  ]);
  const fiscais = calcularAlertasFiscais({
    entidade: externos.cliente.nome,
    codigoIbge: externos.cliente.codigoIbge,
    siconfi: externos.siconfi,
  });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const temFiltro = filtros.status || filtros.gravidade || filtros.origem || filtros.unidade || filtros.busca;

  const url = (mudancas: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    const valores = { ...filtros, pagina: undefined, ...mudancas };
    for (const [k, v] of Object.entries(valores)) {
      if (v && !(k === "pagina" && Number(v) === 1)) q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `/alertas?${s}` : "/alertas";
  };

  return (
    <ProvedorRecolhiveis pagina="alertas" iniciais={pref.recolhidos}>
      <CabecalhoPagina
        titulo="Alertas"
        descricao="Alertas automáticos dos limites fiscais (LRF/SICONFI) e situações que precisam de intervenção, classificadas por gravidade e tratadas com plano de ação."
        acoes={
          <>
            <a
              href={PDF_RELATORIO.alertas(filtros.unidade)}
              target="_blank"
              rel="noopener"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <FileDown aria-hidden="true" />
              Painel (PDF)
            </a>
            <Link href="/alertas/nova" className={buttonVariants({ size: "lg" })}>
              <Plus aria-hidden="true" />
              Novo alerta
            </Link>
          </>
        }
      />

      <BlocoRecolhivel
        id="fiscais"
        titulo="Alertas fiscais (LRF)"
        descricao="Gerados automaticamente a partir do SICONFI: despesa com pessoal (folha), dívida consolidada e entregas vencidas. Registre o alerta para tratá-lo com plano de ação."
        icone={<ShieldAlert />}
        resumo={fiscais.length ? `${fiscais.length} alerta(s)` : "nenhum alerta"}
        className="mb-6"
        acoes={
          <Link href="/dados-externos" className={buttonVariants({ variant: "ghost", size: "sm" })}>
            Dados externos
          </Link>
        }
      >
        <ListaAlertasFiscais alertas={fiscais} />
      </BlocoRecolhivel>

      <BlocoRecolhivel
        id="painel"
        titulo="Painel de alertas"
        descricao="Alertas registrados em aberto por gravidade e matriz de risco."
        icone={<Siren />}
        resumo={`${painel.emAberto} em aberto`}
        className="mb-6"
      >
        <section aria-label="Painel de alertas" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="grid grid-cols-2 gap-3 self-start">
            {NIVEIS_RISCO.map((n) => {
              const v = VISUAL_GRAVIDADE[n];
              const Icone = v.icone;
              return (
                <Link
                  key={n}
                  href={url({ status: "ABERTAS", gravidade: n })}
                  className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <Card size="sm" className="h-full transition-colors hover:bg-muted/40">
                    <CardContent className="flex items-center gap-3">
                      <span className={cn("flex size-9 items-center justify-center rounded-md", v.celula)}>
                        <Icone aria-hidden className="size-4" />
                      </span>
                      <div>
                        <p className="font-heading text-xl font-semibold tabular-nums">{painel.porNivel[n]}</p>
                        <p className="text-xs text-muted-foreground">Abertas · {NIVEL_RISCO[n].toLowerCase()}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
            <Card size="sm" className="col-span-2">
              <CardContent className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex size-9 items-center justify-center rounded-md",
                    painel.acoesVencidas > 0 ? "bg-perigo/12 text-perigo" : "bg-primary/10 text-primary",
                  )}
                >
                  <AlarmClock aria-hidden className="size-4" />
                </span>
                <div>
                  <p className="font-heading text-xl font-semibold tabular-nums">{painel.acoesVencidas}</p>
                  <p className="text-xs text-muted-foreground">Ações vencidas nos planos dos alertas</p>
                </div>
              </CardContent>
            </Card>
          </div>
          <Card size="sm">
            <CardHeader>
              <CardTitle className="text-sm">Matriz de risco · {painel.emAberto} situação(ões) em aberto</CardTitle>
            </CardHeader>
            <CardContent>
              <MatrizRisco matriz={painel.matriz} />
            </CardContent>
          </Card>
        </section>
      </BlocoRecolhivel>

      <Card className="mb-6">
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="busca">Buscar</Label>
              <Input id="busca" name="busca" defaultValue={filtros.busca} placeholder="Título ou número (ex.: 001/2026)" className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Situação</Label>
              <select id="status" name="status" defaultValue={filtros.status} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                <option value="ABERTAS">Em aberto</option>
                {Object.entries(STATUS_SITUACAO).map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gravidade">Gravidade</Label>
              <select id="gravidade" name="gravidade" defaultValue={filtros.gravidade} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                {NIVEIS_RISCO.map((n) => (
                  <option key={n} value={n}>
                    {NIVEL_RISCO[n]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="origem">Origem</Label>
              <select id="origem" name="origem" defaultValue={filtros.origem} className={CLASSE_SELECT}>
                <option value="">Todas</option>
                {Object.entries(ORIGEM_SITUACAO).map(([valor, rotulo]) => (
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
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1">
              <button type="submit" className={buttonVariants({ variant: "secondary", size: "lg" })}>
                <Filter aria-hidden="true" />
                Filtrar
              </button>
              {temFiltro && (
                <Link href="/alertas" className={buttonVariants({ variant: "ghost", size: "lg" })}>
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
                Situações{temFiltro ? " filtradas" : ""}: {total} encontrada(s), página {filtros.pagina} de {paginas}
              </caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">
                    Número
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Situação
                  </th>
                  <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">
                    Origem
                  </th>
                  <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">
                    Unidade
                  </th>
                  <th scope="col" className="px-3 py-3 font-medium">
                    Gravidade
                  </th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {situacoes.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs font-semibold whitespace-nowrap">{numeroSituacao(s.numero, s.ano)}</td>
                    <td className="px-3 py-3">
                      <Link href={`/alertas/${s.id}`} className="font-medium underline-offset-4 hover:underline">
                        {s.titulo}
                      </Link>
                      {s._count.documentos > 0 && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          <Paperclip aria-hidden="true" className="size-3" />
                          {s._count.documentos}
                          <span className="sr-only"> anexo(s)</span>
                        </span>
                      )}
                      {s.sigilosa && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-muted-foreground" title="Denúncia sigilosa">
                          <EyeOff aria-hidden="true" className="size-3" />
                          <span className="sr-only">Denúncia sigilosa</span>
                        </span>
                      )}
                      {s.acoesVencidas > 0 && (
                        <span className="mt-1 block">
                          <SeloVencida />
                          <span className="ml-1 text-xs text-perigo">
                            {s.acoesVencidas} {s.acoesVencidas === 1 ? "ação" : "ações"} no plano
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="hidden px-3 py-3 md:table-cell">{ORIGEM_SITUACAO[s.origem]}</td>
                    <td className="hidden px-3 py-3 lg:table-cell">
                      {s.unidade ? (
                        <span title={s.unidade.nome}>{s.unidade.sigla ?? s.unidade.nome}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <SeloGravidade nivel={s.nivel} pontuacao={s.probabilidade * s.impacto} />
                    </td>
                    <td className="px-5 py-3">
                      <SeloStatusSituacao status={s.status} />
                    </td>
                  </tr>
                ))}
                {situacoes.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                      {temFiltro ? "Nenhuma situação encontrada com esses filtros." : "Nenhuma situação registrada."}
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
            {total} situações · página {filtros.pagina} de {paginas}
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
    </ProvedorRecolhiveis>
  );
}
