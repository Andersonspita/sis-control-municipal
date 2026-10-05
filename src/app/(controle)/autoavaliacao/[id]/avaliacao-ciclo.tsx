"use client";

import { useMemo, useState } from "react";
import { Keyboard, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { SituacaoRequisito } from "@/generated/prisma/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Selo, VISUAL_SITUACAO } from "@/components/selos-status";
import {
  calcularConformidade,
  compararGrupos,
  conformidadePorGrupo,
  formatarPercentual,
  mapaCapitulos,
  SITUACOES,
  type ResultadoConformidade,
} from "@/lib/dados/conformidade";
import type { NoRequisito, RespostaView } from "@/lib/dados/autoavaliacao";
import { SITUACAO_REQUISITO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { CartaoRequisito } from "./cartao-requisito";
import { AcoesCiclo } from "./acoes-ciclo";

type Filtro = "todos" | "pendentes" | SituacaoRequisito;

const FILTROS: { valor: Filtro; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "NAO_AVALIADO", rotulo: "Não avaliados" },
  { valor: "NAO_ATENDIDO", rotulo: "Não atendidos" },
  { valor: "PARCIALMENTE_ATENDIDO", rotulo: "Parcialmente atendidos" },
  { valor: "ATENDIDO", rotulo: "Atendidos" },
  { valor: "NAO_APLICAVEL", rotulo: "Não se aplica" },
  { valor: "pendentes", rotulo: "Lacunas (não atendido ou parcial)" },
];

function casaFiltro(filtro: Filtro, s: SituacaoRequisito) {
  if (filtro === "todos") return true;
  if (filtro === "pendentes") return s === "NAO_ATENDIDO" || s === "PARCIALMENTE_ATENDIDO";
  return s === filtro;
}

type Anterior = { id: string; nome: string; respostas: { requisitoId: string; situacao: SituacaoRequisito }[] } | null;

export function AvaliacaoCiclo({
  cicloId,
  bloqueado,
  podeConcluir,
  nos,
  respostasIniciais,
  anterior,
  planoId,
}: {
  cicloId: string;
  bloqueado: boolean;
  podeConcluir: boolean;
  nos: NoRequisito[];
  respostasIniciais: RespostaView[];
  anterior: Anterior;
  planoId: string | null;
}) {
  const [respostas, setRespostas] = useState(() => new Map(respostasIniciais.map((r) => [r.requisitoId, r])));
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [capitulo, setCapitulo] = useState<string | "todos">("todos");
  // Requisitos salvos durante o filtro atual continuam visíveis até o filtro mudar.
  const [fixados, setFixados] = useState<Set<string>>(() => new Set());

  const estrutura = useMemo(() => {
    const capituloDe = mapaCapitulos(nos);
    const filhos = new Map<string | null, NoRequisito[]>();
    for (const n of nos) filhos.set(n.paiId, [...(filhos.get(n.paiId) ?? []), n]);
    const capitulos = nos.filter((n) => n.paiId === null);
    return { capituloDe, filhos, capitulos, porId: new Map(nos.map((n) => [n.id, n])) };
  }, [nos]);

  const lista = useMemo(() => [...respostas.values()], [respostas]);
  const geral = useMemo(() => calcularConformidade(lista), [lista]);
  const porCapitulo = useMemo(
    () => conformidadePorGrupo(lista, (r) => estrutura.capituloDe.get(r.requisitoId)),
    [lista, estrutura],
  );
  const evolucao = useMemo(() => {
    if (!anterior) return null;
    const ant = conformidadePorGrupo(anterior.respostas, (r) => estrutura.capituloDe.get(r.requisitoId));
    return {
      geral: compararGrupos(new Map([["geral", geral]]), new Map([["geral", calcularConformidade(anterior.respostas)]]))[0],
      capitulos: compararGrupos(porCapitulo, ant),
    };
  }, [anterior, geral, porCapitulo, estrutura]);

  const lacunas = geral.contagem.NAO_ATENDIDO + geral.contagem.PARCIALMENTE_ATENDIDO;

  function mudarFiltro(f: Filtro) {
    setFiltro(f);
    setFixados(new Set());
  }

  function aoSalvar(r: RespostaView) {
    setRespostas((m) => new Map(m).set(r.requisitoId, r));
    setFixados((s) => new Set(s).add(r.requisitoId));
  }

  function visivel(no: NoRequisito) {
    const r = respostas.get(no.id);
    if (!r) return false;
    return fixados.has(no.id) || casaFiltro(filtro, r.situacao);
  }

  /** Renderiza um nó: cartões dos requisitos avaliados e cabeçalhos dos agrupadores intermediários. */
  function renderizar(no: NoRequisito, nivel: number): React.ReactNode {
    const filhos = estrutura.filhos.get(no.id) ?? [];
    const proprio = respostas.has(no.id) && visivel(no) ? (
      <CartaoRequisito key={no.id} no={no} resposta={respostas.get(no.id)!} bloqueado={bloqueado} onSalvo={aoSalvar} />
    ) : null;
    const descendentes = filhos.map((f) => renderizar(f, nivel + 1)).filter(Boolean);
    if (!proprio && descendentes.length === 0) return null;
    if (nivel === 0 || respostas.has(no.id)) {
      return (
        <div key={`g-${no.id}`} className="space-y-3">
          {proprio}
          {descendentes}
        </div>
      );
    }
    return (
      <section key={`g-${no.id}`} aria-labelledby={`grupo-${no.id}`} className="space-y-3">
        <div className="pt-2">
          <h3 id={`grupo-${no.id}`} className="text-sm font-semibold">
            <span className="mr-2 font-mono text-xs text-muted-foreground">{no.codigo}</span>
            {no.titulo}
          </h3>
          {no.descricao && <p className="mt-1 max-w-4xl text-xs leading-relaxed text-muted-foreground">{no.descricao}</p>}
        </div>
        <div className="space-y-3 border-l pl-4">{descendentes}</div>
      </section>
    );
  }

  const capitulosVisiveis = estrutura.capitulos.filter((c) => capitulo === "todos" || c.id === capitulo);
  const conteudo = capitulosVisiveis
    .map((c) => {
      const corpo = renderizar(c, 0);
      if (!corpo) return null;
      const res = porCapitulo.get(c.id);
      return (
        <section key={c.id} aria-labelledby={`cap-${c.id}`} className="space-y-3">
          <div className="sticky top-16 z-10 -mx-1 flex flex-wrap items-baseline justify-between gap-2 bg-background/95 px-1 py-2 backdrop-blur">
            <h2 id={`cap-${c.id}`} className="font-heading text-base font-semibold">
              <span className="mr-2 font-mono text-sm text-muted-foreground">{c.codigo}</span>
              {c.titulo}
            </h2>
            {res && (
              <span className="text-xs text-muted-foreground tabular-nums">
                {res.avaliados}/{res.total} avaliados · conformidade {formatarPercentual(res.indice)}
              </span>
            )}
          </div>
          {c.descricao && !respostas.has(c.id) && (
            <details className="group rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                Texto da norma ({c.codigo})
              </summary>
              <p className="mt-2 max-w-4xl leading-relaxed text-muted-foreground">{c.descricao}</p>
            </details>
          )}
          {corpo}
        </section>
      );
    })
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <section aria-label="Resumo do ciclo" className="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.6fr]">
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Conformidade</p>
            <p className="font-heading text-3xl font-semibold tabular-nums">{formatarPercentual(geral.indice)}</p>
            <Progress value={geral.indice === null ? 0 : geral.indice * 100} aria-label="Conformidade geral do ciclo" />
            <p className="text-xs text-muted-foreground">Atende = 1, parcial = 0,5; “não se aplica” e não avaliados ficam fora.</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">Progresso das respostas</p>
            <p className="font-heading text-3xl font-semibold tabular-nums">
              {geral.avaliados}
              <span className="text-lg font-normal text-muted-foreground">/{geral.total}</span>
            </p>
            <Progress value={geral.total ? (geral.avaliados / geral.total) * 100 : 0} aria-label="Progresso das respostas" />
            <p className="text-xs text-muted-foreground">{geral.contagem.NAO_AVALIADO} requisitos ainda não avaliados.</p>
          </CardContent>
        </Card>
        <Card className="md:col-span-2 xl:col-span-1">
          <CardContent className="flex h-full flex-col justify-between gap-4">
            <ul className="flex flex-wrap gap-2" aria-label="Respostas por situação">
              {SITUACOES.map((s) => (
                <li key={s}>
                  <Selo icone={VISUAL_SITUACAO[s].icone} tom={VISUAL_SITUACAO[s].tom}>
                    {SITUACAO_REQUISITO[s]}: <span className="tabular-nums">{geral.contagem[s]}</span>
                  </Selo>
                </li>
              ))}
            </ul>
            <AcoesCiclo
              cicloId={cicloId}
              bloqueado={bloqueado}
              podeConcluir={podeConcluir}
              naoAvaliados={geral.contagem.NAO_AVALIADO}
              lacunas={lacunas}
              planoId={planoId}
            />
          </CardContent>
        </Card>
      </section>

      <Tabs defaultValue="requisitos">
        <TabsList aria-label="Seções do ciclo">
          <TabsTrigger value="requisitos" className="px-3">Requisitos</TabsTrigger>
          <TabsTrigger value="capitulos" className="px-3">Resultado por capítulo</TabsTrigger>
          <TabsTrigger value="evolucao" className="px-3">Evolução</TabsTrigger>
        </TabsList>

        <TabsContent value="requisitos" className="pt-4">
          <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
            <aside className="space-y-6 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
              <fieldset>
                <legend className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Filtrar</legend>
                <div className="space-y-0.5">
                  {FILTROS.map((f) => {
                    const n = lista.filter((r) => casaFiltro(f.valor, r.situacao)).length;
                    return (
                      <label
                        key={f.valor}
                        className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 has-checked:bg-primary/10 has-checked:font-medium has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="filtro-requisitos"
                            className="sr-only"
                            checked={filtro === f.valor}
                            onChange={() => mudarFiltro(f.valor)}
                          />
                          {f.rotulo}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{n}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <nav aria-label="Capítulos da norma">
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Capítulos</p>
                <ul className="space-y-0.5">
                  <li>
                    <button
                      type="button"
                      onClick={() => setCapitulo("todos")}
                      aria-pressed={capitulo === "todos"}
                      className={cn(
                        "w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                        capitulo === "todos" && "bg-primary/10 font-medium text-primary",
                      )}
                    >
                      Todos os capítulos
                    </button>
                  </li>
                  {estrutura.capitulos.map((c) => {
                    const res = porCapitulo.get(c.id);
                    if (!res) return null;
                    const ativo = capitulo === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setCapitulo(c.id)}
                          aria-pressed={ativo}
                          className={cn(
                            "w-full rounded-md px-2 py-1.5 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50",
                            ativo && "bg-primary/10 font-medium text-primary",
                          )}
                        >
                          <span className="flex items-baseline gap-2">
                            <span className="shrink-0 font-mono text-xs">{c.codigo}</span>
                            <span className="line-clamp-2 flex-1">{c.titulo}</span>
                          </span>
                          <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                            <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                              <span
                                className="block h-full bg-primary"
                                style={{ width: `${res.total ? (res.avaliados / res.total) * 100 : 0}%` }}
                              />
                            </span>
                            {res.avaliados}/{res.total}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>

              {!bloqueado && (
                <p className="flex gap-2 text-xs text-muted-foreground">
                  <Keyboard aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    Com o foco num requisito: teclas 1 a 4 escolhem a avaliação; Ctrl+Enter salva.
                  </span>
                </p>
              )}
            </aside>

            <div className="min-w-0 space-y-8">
              {conteudo.length ? (
                conteudo
              ) : (
                <p className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">
                  Nenhum requisito corresponde ao filtro escolhido.
                </p>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="capitulos" className="pt-4">
          <TabelaCapitulos capitulos={estrutura.capitulos} porCapitulo={porCapitulo} geral={geral} />
        </TabsContent>

        <TabsContent value="evolucao" className="pt-4">
          {evolucao && anterior ? (
            <Card>
              <CardHeader>
                <CardTitle>Evolução em relação a “{anterior.nome}”</CardTitle>
                <CardDescription>Conformidade por capítulo no ciclo anterior concluído da mesma norma e alcance.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
                <table className="w-full text-sm">
                  <caption className="sr-only">Evolução da conformidade por capítulo</caption>
                  <thead>
                    <tr className="border-y text-left text-muted-foreground">
                      <th scope="col" className="px-5 py-2.5 font-medium">Capítulo</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Ciclo anterior</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Ciclo atual</th>
                      <th scope="col" className="px-5 py-2.5 font-medium">Variação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {estrutura.capitulos.map((c) => {
                      const e = evolucao.capitulos.find((x) => x.chave === c.id);
                      if (!e) return null;
                      return (
                        <tr key={c.id} className="border-b last:border-0">
                          <th scope="row" className="px-5 py-2.5 text-left font-normal">
                            <span className="mr-2 font-mono text-xs text-muted-foreground">{c.codigo}</span>
                            {c.titulo}
                          </th>
                          <td className="px-3 py-2.5 text-right tabular-nums">{e.anterior === null ? "—" : `${e.anterior.toLocaleString("pt-BR")}%`}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{e.atual === null ? "—" : `${e.atual.toLocaleString("pt-BR")}%`}</td>
                          <td className="px-5 py-2.5">
                            <Variacao valor={e.variacao} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/40 font-medium">
                      <th scope="row" className="px-5 py-2.5 text-left">Geral</th>
                      <td className="px-3 py-2.5 text-right tabular-nums">{evolucao.geral.anterior === null ? "—" : `${evolucao.geral.anterior.toLocaleString("pt-BR")}%`}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{evolucao.geral.atual === null ? "—" : `${evolucao.geral.atual.toLocaleString("pt-BR")}%`}</td>
                      <td className="px-5 py-2.5">
                        <Variacao valor={evolucao.geral.variacao} />
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </CardContent>
            </Card>
          ) : (
            <p className="rounded-xl border border-dashed px-5 py-12 text-center text-sm text-muted-foreground">
              Não há ciclo anterior concluído desta norma com o mesmo alcance para comparar.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Variacao({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-muted-foreground">Sem comparação</span>;
  const texto = `${valor > 0 ? "+" : ""}${valor.toLocaleString("pt-BR")} p.p.`;
  if (valor > 0)
    return (
      <Selo icone={TrendingUp} tom="sucesso">
        Melhorou {texto}
      </Selo>
    );
  if (valor < 0)
    return (
      <Selo icone={TrendingDown} tom="perigo">
        Piorou {texto}
      </Selo>
    );
  return (
    <Selo icone={Minus} tom="neutro">
      Estável
    </Selo>
  );
}

function TabelaCapitulos({
  capitulos,
  porCapitulo,
  geral,
}: {
  capitulos: NoRequisito[];
  porCapitulo: Map<string, ResultadoConformidade>;
  geral: ResultadoConformidade;
}) {
  const linha = (r: ResultadoConformidade) => (
    <>
      <td className="px-3 py-2.5 text-right tabular-nums">{r.total}</td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{r.contagem.ATENDIDO}</td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{r.contagem.PARCIALMENTE_ATENDIDO}</td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums sm:table-cell">{r.contagem.NAO_ATENDIDO}</td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.contagem.NAO_APLICAVEL}</td>
      <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{r.contagem.NAO_AVALIADO}</td>
      <td className="min-w-40 px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="block h-full bg-chart-1" style={{ width: `${(r.indice ?? 0) * 100}%` }} />
          </span>
          <span className="w-14 text-right font-medium tabular-nums">{formatarPercentual(r.indice)}</span>
        </div>
      </td>
    </>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conformidade por capítulo</CardTitle>
        <CardDescription>Capítulos são os itens de nível superior da norma. Calculado com as respostas salvas.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <caption className="sr-only">Conformidade por capítulo</caption>
          <thead>
            <tr className="border-y text-left text-muted-foreground">
              <th scope="col" className="px-5 py-2.5 font-medium">Capítulo</th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">Requisitos</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Atende</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Parcial</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium sm:table-cell">Não atende</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Não se aplica</th>
              <th scope="col" className="hidden px-3 py-2.5 text-right font-medium md:table-cell">Não avaliado</th>
              <th scope="col" className="px-5 py-2.5 font-medium">Conformidade</th>
            </tr>
          </thead>
          <tbody>
            {capitulos.map((c) => {
              const r = porCapitulo.get(c.id);
              if (!r) return null;
              return (
                <tr key={c.id} className="border-b last:border-0">
                  <th scope="row" className="px-5 py-2.5 text-left font-normal">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{c.codigo}</span>
                    {c.titulo}
                  </th>
                  {linha(r)}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40 font-medium">
              <th scope="row" className="px-5 py-2.5 text-left">Total da norma</th>
              {linha(geral)}
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}
