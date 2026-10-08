import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, FilePlus2, Play, RotateCcw, Trash2 } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { anoAtual, carregarPaai } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SeloGravidade } from "@/components/alertas/selos";
import { SeloStatusAuditoria, SeloStatusPaai } from "@/components/auditorias/selos";
import { numeroAuditoria, periodoPrevisto } from "@/lib/auditorias";
import { formatarDataHora } from "@/lib/datas";
import { NIVEIS_RISCO, NIVEL_RISCO } from "@/lib/risco";
import { TIPO_AUDITORIA } from "@/lib/rotulos";
import { alterarStatusPaai, criarPaai, excluirItemPaai, iniciarAuditoriaDoItem } from "./actions";
import { BotaoAcao } from "../botao-acao";
import { DialogoItemPaai } from "./dialogo-item";

export const metadata: Metadata = { title: "Plano Anual de Auditoria Interna" };

export default async function Paai(props: PageProps<"/auditorias/paai">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const pedido = Number.parseInt(String((await props.searchParams).ano ?? ""), 10);
  const ano = Number.isInteger(pedido) && pedido >= 2000 && pedido <= 2100 ? pedido : anoAtual();
  const { plano, unidades, anos } = await carregarPaai(ctx, ano);
  const rascunho = plano?.status === "RASCUNHO";
  const controlador = ctx.perfil === "CONTROLADOR";
  const porNivel = Object.fromEntries(NIVEIS_RISCO.map((n) => [n, plano?.itens.filter((i) => i.nivel === n).length ?? 0]));

  return (
    <>
      <Link href="/auditorias" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Auditorias
      </Link>
      <CabecalhoPagina
        titulo={`Plano Anual de Auditoria Interna ${ano}`}
        descricao="Auditorias previstas para o ano, priorizadas pelo risco (probabilidade × impacto). Depois de aprovado, cada uma é iniciada daqui."
        acoes={
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/auditorias/paai?ano=${ano - 1}`} className={buttonVariants({ variant: "outline", size: "lg" })} aria-label={`PAAI ${ano - 1}`}>
              <ChevronLeft aria-hidden="true" /> {ano - 1}
            </Link>
            <Link href={`/auditorias/paai?ano=${ano + 1}`} className={buttonVariants({ variant: "outline", size: "lg" })} aria-label={`PAAI ${ano + 1}`}>
              {ano + 1} <ChevronRight aria-hidden="true" />
            </Link>
          </div>
        }
      />

      {anos.length > 0 && (
        <nav aria-label="Planos anuais" className="mb-4 flex flex-wrap gap-2 text-sm">
          {anos.map((p) => (
            <Link
              key={p.ano}
              href={`/auditorias/paai?ano=${p.ano}`}
              aria-current={p.ano === ano ? "page" : undefined}
              className={buttonVariants({ variant: p.ano === ano ? "secondary" : "ghost", size: "sm" })}
            >
              {p.ano}
            </Link>
          ))}
        </nav>
      )}

      {!plano ? (
        <Card>
          <CardContent className="space-y-3 py-6 text-center">
            <p className="text-muted-foreground">Ainda não há PAAI para {ano}.</p>
            <BotaoAcao acao={criarPaai.bind(null, ano)} variant="default" size="lg">
              <FilePlus2 aria-hidden="true" /> Criar PAAI {ano}
            </BotaoAcao>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <CardContent className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <SeloStatusPaai status={plano.status} />
                {plano.aprovadoEm && (
                  <span className="text-muted-foreground">
                    Aprovado em {formatarDataHora(plano.aprovadoEm)}
                    {plano.aprovadoPor ? ` por ${plano.aprovadoPor}` : ""}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {plano.itens.length} auditoria(s) ·{" "}
                  {NIVEIS_RISCO.filter((n) => porNivel[n]).map((n) => `${porNivel[n]} ${NIVEL_RISCO[n].toLowerCase()}`).join(" · ") || "sem itens"}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {rascunho && <DialogoItemPaai planoId={plano.id} unidades={unidades} />}
                {controlador &&
                  (rascunho ? (
                    <BotaoAcao acao={alterarStatusPaai.bind(null, plano.id, "APROVADO")} confirmar={`Aprovar o PAAI ${ano}? As auditorias previstas poderão ser iniciadas.`} variant="secondary" size="lg">
                      <CheckCircle2 aria-hidden="true" /> Aprovar PAAI
                    </BotaoAcao>
                  ) : (
                    <BotaoAcao acao={alterarStatusPaai.bind(null, plano.id, "RASCUNHO")} confirmar="Voltar o PAAI para rascunho para alterá-lo?" variant="outline" size="lg">
                      <RotateCcw aria-hidden="true" /> Voltar para rascunho
                    </BotaoAcao>
                  ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Auditorias previstas no PAAI {ano}, da maior para a menor prioridade</caption>
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="px-5 py-3 font-medium">Prioridade</th>
                      <th scope="col" className="px-3 py-3 font-medium">Objeto</th>
                      <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Tipo</th>
                      <th scope="col" className="hidden px-3 py-3 font-medium lg:table-cell">Unidade</th>
                      <th scope="col" className="px-3 py-3 font-medium">Período</th>
                      <th scope="col" className="px-3 py-3 font-medium">Risco</th>
                      <th scope="col" className="px-5 py-3 font-medium">Auditoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plano.itens.map((i, pos) => (
                      <tr key={i.id} className="border-b align-top last:border-0 hover:bg-muted/40">
                        <td className="px-5 py-3 font-mono text-xs font-semibold">{pos + 1}º</td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{i.titulo}</p>
                          {i.objetivo && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{i.objetivo}</p>}
                        </td>
                        <td className="hidden px-3 py-3 md:table-cell">{TIPO_AUDITORIA[i.tipo]}</td>
                        <td className="hidden px-3 py-3 lg:table-cell">
                          {i.unidade ? <span title={i.unidade.nome}>{i.unidade.sigla ?? i.unidade.nome}</span> : "Entidade inteira"}
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">{periodoPrevisto(i.mesInicio, i.mesFim)}</td>
                        <td className="px-3 py-3">
                          <SeloGravidade nivel={i.nivel} pontuacao={i.probabilidade * i.impacto} />
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap items-center gap-1">
                            {i.auditoria ? (
                              <Link href={`/auditorias/${i.auditoria.id}`} className="inline-flex items-center gap-2 underline-offset-4 hover:underline">
                                <span className="font-mono text-xs font-semibold">{numeroAuditoria(i.auditoria.numero, i.auditoria.ano)}</span>
                                <SeloStatusAuditoria status={i.auditoria.status} />
                              </Link>
                            ) : plano.status === "APROVADO" ? (
                              <BotaoAcao acao={iniciarAuditoriaDoItem.bind(null, i.id)} confirmar={`Iniciar a auditoria “${i.titulo}”?`}>
                                <Play aria-hidden="true" /> Iniciar
                              </BotaoAcao>
                            ) : (
                              <span className="text-xs text-muted-foreground">Após aprovação</span>
                            )}
                            {rascunho && (
                              <>
                                <DialogoItemPaai planoId={plano.id} unidades={unidades} item={i} />
                                {!i.auditoria && (
                                  <BotaoAcao acao={excluirItemPaai.bind(null, i.id)} confirmar={`Excluir “${i.titulo}” do PAAI?`} variant="ghost" size="icon-sm" rotulo="Excluir do PAAI">
                                    <Trash2 aria-hidden="true" />
                                  </BotaoAcao>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {plano.itens.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-5 py-10 text-center text-muted-foreground">
                          Nenhuma auditoria prevista. Inclua as auditorias do ano e aprove o plano.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
