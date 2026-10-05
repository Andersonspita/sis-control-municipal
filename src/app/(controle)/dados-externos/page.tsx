import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert, ExternalLink, Landmark, Siren, TriangleAlert, Users, Wallet } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { carregarDadosExternos, type Coleta } from "@/lib/dados/integracoes";
import { LIMITE_DCL, LIMITES_PESSOAL, PODER, poderDaEntidade, ROTULO_FAIXA, faixaDcl } from "@/lib/integracoes/lrf";
import { chavePortal } from "@/lib/integracoes/portal-transparencia";
import { linksTcmBa } from "@/lib/integracoes/tcmba";
import { ROTULO_FONTE } from "@/lib/integracoes/sincronizar";
import type { DadosSiconfi, EntregaSiconfi } from "@/lib/integracoes/tipos";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatarDataHora } from "@/lib/datas";
import { BotaoAtualizar } from "./botao-atualizar";
import { ConsultaSancoes } from "./consulta-sancoes";
import { BarraLimite, dataIso, Fonte, moeda, percentual, SeloColeta, SeloEntrega, SeloFaixa } from "./componentes";

export const metadata: Metadata = { title: "Dados externos" };

/** Link para registrar uma situação no módulo Medidas com os campos já preenchidos. */
function linkMedida(p: { titulo: string; descricao: string; probabilidade: number; impacto: number }) {
  const qs = new URLSearchParams({
    origem: "ALERTA",
    titulo: p.titulo.slice(0, 200),
    descricao: p.descricao.slice(0, 4000),
    probabilidade: String(p.probabilidade),
    impacto: String(p.impacto),
  });
  return `/medidas/nova?${qs}`;
}

function medidaPessoal(s: DadosSiconfi, entidade: string) {
  const p = s.pessoal!;
  const l = LIMITES_PESSOAL[s.poder];
  const gravidade = { ALERTA: [3, 4], PRUDENCIAL: [4, 4], EXCEDIDO: [5, 5], REGULAR: [2, 3] }[p.faixa];
  return linkMedida({
    titulo: `Despesa com pessoal: ${ROTULO_FAIXA[p.faixa].toLowerCase()} da LRF (${p.referencia})`,
    descricao:
      `Segundo o ${p.referencia} publicado no SICONFI, a despesa total com pessoal de ${entidade} (${PODER[s.poder]}) ` +
      `somou ${moeda(p.valor)}, equivalente a ${percentual(p.percentual)} da receita corrente líquida ajustada. ` +
      `Limites da LRF: alerta ${percentual(l.alerta)} (art. 59, § 1º, II), prudencial ${percentual(l.prudencial)} (art. 22, parágrafo único) ` +
      `e máximo ${percentual(l.maximo)} (arts. 19 e 20). Avaliar as medidas de contenção e, se ultrapassado o máximo, ` +
      `a recondução no prazo do art. 23 da LRF.`,
    probabilidade: gravidade[0],
    impacto: gravidade[1],
  });
}

function medidaEntregas(pendentes: EntregaSiconfi[], entidade: string) {
  const lista = pendentes.map((e) => `- ${e.entregavel} — ${e.rotuloPeriodo} (prazo ${dataIso(e.prazo)})`).join("\n");
  return linkMedida({
    titulo: `Entregas pendentes no SICONFI (${pendentes.length})`,
    descricao:
      `O extrato de entregas do SICONFI (Tesouro Nacional) não registra os seguintes demonstrativos de ${entidade}, com prazo vencido:\n${lista}\n\n` +
      `A falta de envio impede transferências voluntárias e operações de crédito (LRF, art. 51, § 2º, e art. 55, § 3º) ` +
      `e gera restrição no CAUC. Verificar com a contabilidade o envio e a homologação.`,
    probabilidade: 4,
    impacto: pendentes.length > 2 ? 4 : 3,
  });
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  icone: Icone,
}: {
  rotulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  icone: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm text-muted-foreground">{rotulo}</p>
          <p className="font-heading text-2xl font-semibold tabular-nums">{valor}</p>
          {detalhe && <div className="text-xs text-muted-foreground">{detalhe}</div>}
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icone aria-hidden className="size-5" />
        </span>
      </CardContent>
    </Card>
  );
}

function AvisoColeta({ coleta }: { coleta: Coleta<unknown> | null }) {
  if (!coleta) return <p className="text-sm text-muted-foreground">Ainda não coletado. Use “Atualizar dados”.</p>;
  if (coleta.status === "PROCESSANDO" && !coleta.travada) return <p className="text-sm text-muted-foreground">Coletando…</p>;
  if (coleta.erro) return <p className="text-sm text-muted-foreground">{coleta.erro}</p>;
  return null;
}

export default async function DadosExternos() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const d = await carregarDadosExternos(ctx);
  const podeAtualizar = ctx.perfil === "CONTROLADOR" || ctx.usuario.adminHorizon;
  const poder = poderDaEntidade(d.cliente.tipo);
  const entidade = d.cliente.nome;
  const ibge = d.ibge?.dados;
  const sic = d.siconfi?.dados;
  const portal = d.portal?.dados;
  const pendentes = sic?.entregas.filter((e) => e.situacao === "PENDENTE") ?? [];
  const limites = LIMITES_PESSOAL[poder];
  const ultimaColeta = [d.ibge, d.siconfi, d.portal]
    .map((c) => c?.coletadoEm)
    .filter((x): x is Date => !!x)
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const populacao = ibge?.populacao ?? d.cliente.populacao;

  return (
    <>
      <CabecalhoPagina
        titulo="Dados externos"
        descricao={`Indicadores oficiais de ${d.cliente.municipio}/${d.cliente.uf} coletados do IBGE, do SICONFI (Tesouro Nacional) e do Portal da Transparência (CGU).`}
        acoes={podeAtualizar ? <BotaoAtualizar processando={d.processando} habilitado={!!d.cliente.codigoIbge} /> : undefined}
      />

      {!d.cliente.codigoIbge && (
        <Alert className="mb-6">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Código IBGE não cadastrado</AlertTitle>
          <AlertDescription>
            As integrações usam o código IBGE do município. Peça ao administrador da HorizonAJ para preenchê-lo no cadastro do cliente.
          </AlertDescription>
        </Alert>
      )}
      {ultimaColeta && (
        <p className="-mt-5 mb-6 text-xs text-muted-foreground">Última coleta: {formatarDataHora(ultimaColeta)}.</p>
      )}

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador
          rotulo="População"
          valor={populacao ? populacao.toLocaleString("pt-BR") : "—"}
          icone={Users}
          detalhe={ibge?.anoPopulacao ? `${ibge.tipoPopulacao === "CENSO" ? "Censo" : "Estimativa IBGE"} ${ibge.anoPopulacao}` : "IBGE"}
        />
        <Indicador
          rotulo="Receita corrente líquida"
          valor={sic?.rcl ? moeda(sic.rcl.valor) : "—"}
          icone={Wallet}
          detalhe={sic?.rcl ? `Últimos 12 meses · ${sic.rcl.referencia}` : "SICONFI"}
        />
        <Indicador
          rotulo={`Despesa com pessoal (${poder === "L" ? "Legislativo" : "Executivo"})`}
          valor={sic?.pessoal ? percentual(sic.pessoal.percentual) : "—"}
          icone={Landmark}
          detalhe={
            sic?.pessoal ? (
              <SeloFaixa faixa={sic.pessoal.faixa}>{ROTULO_FAIXA[sic.pessoal.faixa]}</SeloFaixa>
            ) : (
              `Limite máximo ${percentual(limites.maximo)} da RCL`
            )
          }
        />
        <Indicador
          rotulo="Entregas SICONFI pendentes"
          valor={sic ? String(pendentes.length) : "—"}
          icone={TriangleAlert}
          detalhe={sic ? (pendentes.length ? "Com prazo vencido" : "Nenhuma pendência") : "SICONFI"}
        />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesa com pessoal × limites da LRF</CardTitle>
            <CardDescription>
              {PODER[poder]} — percentual da despesa total com pessoal sobre a RCL ajustada (RGF, Anexo 1).
              {poder === "E" && d.cliente.tipo !== "PREFEITURA" && " Para esta entidade, são exibidos os dados do Executivo municipal."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sic?.pessoal ? (
              <>
                <BarraLimite
                  rotulo="Apurado"
                  valor={sic.pessoal.percentual}
                  alerta={limites.alerta}
                  prudencial={limites.prudencial}
                  maximo={limites.maximo}
                />
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Despesa total com pessoal</dt>
                    <dd className="font-medium tabular-nums">{moeda(sic.pessoal.valor)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">RCL ajustada</dt>
                    <dd className="font-medium tabular-nums">{sic.rcl?.ajustadaPessoal ? moeda(sic.rcl.ajustadaPessoal) : "—"}</dd>
                  </div>
                </dl>
                {sic.pessoal.faixa !== "REGULAR" && (
                  <Link href={medidaPessoal(sic, entidade)} className={buttonVariants({ variant: "outline" })}>
                    <Siren aria-hidden="true" /> Registrar medida
                  </Link>
                )}
              </>
            ) : (
              <AvisoColeta coleta={d.siconfi} />
            )}
            <Fonte nome="SICONFI" referencia={sic?.pessoal?.referencia} coletadoEm={d.siconfi?.coletadoEm} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Entregas ao SICONFI</CardTitle>
            <CardDescription>
              RREO, RGF, DCA e MSC{sic?.instituicao ? ` de ${sic.instituicao}` : ""}: o que venceu e a próxima obrigação de cada demonstrativo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sic ? (
              <>
                <div className="max-h-80 overflow-y-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Demonstrativo</TableHead>
                        <TableHead>Período</TableHead>
                        <TableHead>Prazo</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...sic.entregas].reverse().map((e) => (
                        <TableRow key={`${e.sigla}-${e.exercicio}-${e.periodicidade}-${e.periodo}`}>
                          <TableCell className="font-medium" title={e.entregavel}>
                            {e.sigla}
                          </TableCell>
                          <TableCell>{e.rotuloPeriodo}</TableCell>
                          <TableCell className="tabular-nums">{dataIso(e.prazo)}</TableCell>
                          <TableCell>
                            <span className="flex items-center gap-2">
                              <SeloEntrega situacao={e.situacao} />
                              {e.entregueEm && <span className="text-xs text-muted-foreground tabular-nums">{dataIso(e.entregueEm)}</span>}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {pendentes.length > 0 && (
                  <Link href={medidaEntregas(pendentes, entidade)} className={buttonVariants({ variant: "outline" })}>
                    <Siren aria-hidden="true" /> Registrar medida para as pendências
                  </Link>
                )}
              </>
            ) : (
              <AvisoColeta coleta={d.siconfi} />
            )}
            {sic?.avisos.map((a) => (
              <p key={a} className="text-xs text-muted-foreground">
                {a}
              </p>
            ))}
            <Fonte nome="SICONFI — extrato de entregas" coletadoEm={d.siconfi?.coletadoEm} />
          </CardContent>
        </Card>

        {poder === "E" && (
          <Card>
            <CardHeader>
              <CardTitle>Endividamento e resultado primário</CardTitle>
              <CardDescription>Dívida consolidada líquida sobre a RCL (RGF, Anexo 2) e resultado primário (RREO, Anexo 6).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {sic?.divida?.percentualDcl != null ? (
                <div className="space-y-3">
                  <BarraLimite rotulo="DCL / RCL" valor={sic.divida.percentualDcl} alerta={LIMITE_DCL.alerta} maximo={LIMITE_DCL.maximo} />
                  <dl className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <dt className="text-muted-foreground">Dívida consolidada</dt>
                      <dd className="font-medium tabular-nums">{sic.divida.consolidada != null ? moeda(sic.divida.consolidada) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Dívida consolidada líquida</dt>
                      <dd className="font-medium tabular-nums">
                        {sic.divida.consolidadaLiquida != null ? moeda(sic.divida.consolidadaLiquida) : "—"}{" "}
                        <SeloFaixa faixa={faixaDcl(sic.divida.percentualDcl)}>
                          {faixaDcl(sic.divida.percentualDcl) === "REGULAR" ? "Dentro do limite" : ROTULO_FAIXA[faixaDcl(sic.divida.percentualDcl)]}
                        </SeloFaixa>
                      </dd>
                    </div>
                  </dl>
                  <Fonte nome="SICONFI" referencia={sic.divida.referencia} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Dívida consolidada não disponível.</p>
              )}
              {sic?.resultadoPrimario ? (
                <div className="space-y-1 border-t pt-4">
                  <p className="text-sm text-muted-foreground">
                    Resultado primário {sic.resultadoPrimario.criterio === "SEM_RPPS" ? "(sem RPPS)" : "(com RPPS)"} até o período
                  </p>
                  <p className="font-heading text-xl font-semibold tabular-nums">{moeda(sic.resultadoPrimario.valor)}</p>
                  {sic.resultadoPrimario.meta != null && (
                    <p className="text-sm">
                      Meta anual da LDO: <span className="tabular-nums">{moeda(sic.resultadoPrimario.meta)}</span>
                      {" — "}
                      {sic.resultadoPrimario.valor >= sic.resultadoPrimario.meta ? (
                        <span className="text-sucesso">já alcançada no acumulado</span>
                      ) : (
                        <span className="text-alerta">ainda não alcançada no acumulado</span>
                      )}
                    </p>
                  )}
                  <Fonte nome="SICONFI" referencia={sic.resultadoPrimario.referencia} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Resultado primário não disponível.</p>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Transferências e convênios federais</CardTitle>
            <CardDescription>Recursos federais recebidos pelo CNPJ da entidade no ano e convênios vigentes no município.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {portal ? (
              <>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">
                      Recebido em {portal.ano} (01 a {String(portal.mesFim).padStart(2, "0")})
                    </p>
                    <p className="font-heading text-xl font-semibold tabular-nums">{moeda(portal.recursos.total)}</p>
                    {portal.recursos.favorecido && (
                      <p className="text-xs text-muted-foreground">
                        Favorecido: {portal.recursos.favorecido.nome}
                        {portal.recursos.favorecido.municipio && ` (${portal.recursos.favorecido.municipio})`}
                      </p>
                    )}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Convênios vigentes</p>
                    <p className="font-heading text-xl font-semibold tabular-nums">{portal.convenios.vigentes}</p>
                    <p className="text-xs text-muted-foreground">
                      {moeda(portal.convenios.valorVigentes)} pactuados · {moeda(portal.convenios.liberadoVigentes)} liberados
                    </p>
                  </div>
                </div>
                {portal.recursos.porOrgao.length > 0 && (
                  <ul className="space-y-1 text-sm">
                    {portal.recursos.porOrgao.slice(0, 5).map((o) => (
                      <li key={o.orgao} className="flex justify-between gap-4">
                        <span className="truncate">{o.orgao}</span>
                        <span className="shrink-0 tabular-nums">{moeda(o.valor)}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {portal.convenios.lista.length > 0 && (
                  <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
                    {portal.convenios.lista.map((c) => (
                      <li key={c.numero + c.convenente} className="space-y-0.5 px-3 py-2">
                        <p className="font-medium">
                          Convênio {c.numero} · {c.orgao} {c.doCliente && <span className="text-xs text-primary">(desta entidade)</span>}
                        </p>
                        <p className="line-clamp-2 text-muted-foreground">{c.objeto || "Objeto não informado"}</p>
                        <p className="text-xs text-muted-foreground">
                          {moeda(c.valor)} · liberado {moeda(c.valorLiberado)} · vigência até {dataIso(c.fimVigencia)} · {c.convenente}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                {(portal.recursos.truncado || portal.convenios.truncado) && (
                  <p className="text-xs text-muted-foreground">Resultado parcial: o volume excedeu o limite de páginas consultadas.</p>
                )}
                {d.portal?.erro && <p className="text-xs text-muted-foreground">{d.portal.erro}</p>}
              </>
            ) : (
              <AvisoColeta coleta={d.portal} />
            )}
            <Fonte nome="Portal da Transparência (CGU)" referencia={d.portal?.referencia} coletadoEm={d.portal?.coletadoEm} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Empresas sancionadas (CEIS/CNEP)</CardTitle>
            <CardDescription>
              Antes de contratar ou pagar, confira se o fornecedor está no Cadastro de Empresas Inidôneas e Suspensas ou no Cadastro Nacional de
              Empresas Punidas. Cada consulta fica registrada na trilha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConsultaSancoes habilitada={!!chavePortal()} />
            {!chavePortal() && (
              <p className="mt-3 text-xs text-muted-foreground">Consulta indisponível: a chave da API do Portal da Transparência não está configurada.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>TCM-BA</CardTitle>
            <CardDescription>
              O Tribunal não publica API nem dados abertos dos municípios, e as consultas exigem verificação humana (reCAPTCHA). Os atalhos abaixo abrem
              as consultas oficiais; selecione o município e a entidade na página do Tribunal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {linksTcmBa(d.cliente).map((l) => (
                <li key={l.url}>
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-full rounded-lg border p-3 text-sm transition-colors hover:bg-muted/50"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      {l.titulo} <ExternalLink className="size-3.5" aria-hidden="true" />
                      <span className="sr-only">(abre em nova aba)</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{l.descricao}</span>
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Fontes e coletas</CardTitle>
          <CardDescription>Situação da última sincronização de cada fonte. A coleta automática diária também atualiza estes dados.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Recorte</TableHead>
                <TableHead>Coletado em</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(
                [
                  ["IBGE", d.ibge],
                  ["SICONFI", d.siconfi],
                  ["PORTAL_TRANSPARENCIA", d.portal],
                ] as const
              ).map(([fonte, c]) => (
                <TableRow key={fonte}>
                  <TableCell className="font-medium">{ROTULO_FONTE[fonte]}</TableCell>
                  <TableCell>{c ? <SeloColeta status={c.status} travada={c.travada} /> : "—"}</TableCell>
                  <TableCell>{c?.referencia ?? "—"}</TableCell>
                  <TableCell className="tabular-nums">{c?.coletadoEm ? formatarDataHora(c.coletadoEm) : "—"}</TableCell>
                  <TableCell className="max-w-sm whitespace-normal text-xs text-muted-foreground">
                    {c?.travada ? "A coleta foi interrompida; atualize novamente." : (c?.erro ?? "")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
