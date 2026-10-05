"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { CircleCheck, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SeloPrioridade, SeloStatusAcao, SeloVencida } from "@/components/selos-status";
import { formatarMoeda } from "@/lib/dados/acoes";
import type { AcaoView, UnidadeOpcao } from "@/lib/dados/planos";
import { diasAte, formatarDataSimples } from "@/lib/datas";
import { cn } from "@/lib/utils";
import { FormAcao } from "./form-acao";
import { FormValidacao } from "./form-validacao";

type Filtro = "todas" | "abertas" | "vencidas" | "validacao" | "concluidas" | "canceladas";

const FILTROS: { valor: Filtro; rotulo: string; casa: (a: AcaoView) => boolean }[] = [
  { valor: "todas", rotulo: "Todas", casa: () => true },
  { valor: "abertas", rotulo: "Abertas", casa: (a) => a.status === "PENDENTE" || a.status === "EM_ANDAMENTO" },
  { valor: "vencidas", rotulo: "Vencidas", casa: (a) => a.vencida },
  { valor: "validacao", rotulo: "Aguardando validação", casa: (a) => a.status === "AGUARDANDO_VALIDACAO" },
  { valor: "concluidas", rotulo: "Concluídas", casa: (a) => a.status === "CONCLUIDA" },
  { valor: "canceladas", rotulo: "Canceladas", casa: (a) => a.status === "CANCELADA" },
];

const ORDEM_PRIORIDADE = { URGENTE: 0, ALTA: 1, MEDIA: 2, BAIXA: 3 } as const;

function quem(a: AcaoView) {
  const unidade = a.unidadeResponsavel
    ? a.unidadeResponsavel.sigla
      ? `${a.unidadeResponsavel.sigla} — ${a.unidadeResponsavel.nome}`
      : a.unidadeResponsavel.nome
    : null;
  return { pessoa: a.responsavel, unidade };
}

export function TabelaAcoes({
  planoId,
  acoes,
  unidades,
  podeAdicionar,
  podeValidar,
}: {
  planoId: string;
  acoes: AcaoView[];
  unidades: UnidadeOpcao[];
  podeAdicionar: boolean;
  podeValidar: boolean;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  // "nova" = criação; id = edição. A ação exibida vem sempre das props (dados atualizados após salvar marcos).
  const [editando, setEditando] = useState<string | null>(null);
  const [validando, setValidando] = useState<string | null>(null);
  const [aberturas, setAberturas] = useState(0);

  const fecharEdicao = useCallback(() => setEditando(null), []);
  const fecharValidacao = useCallback(() => setValidando(null), []);

  function abrirEdicao(id: string) {
    setAberturas((n) => n + 1);
    setEditando(id);
  }

  const acaoEditada = editando && editando !== "nova" ? (acoes.find((a) => a.id === editando) ?? null) : null;
  const acaoValidada = validando ? (acoes.find((a) => a.id === validando) ?? null) : null;
  const criterio = FILTROS.find((f) => f.valor === filtro)!;
  const visiveis = acoes
    .filter(criterio.casa)
    .sort((a, b) => {
      const p = ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade];
      if (p) return p;
      return (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999");
    });

  return (
    <section aria-labelledby="titulo-acoes" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h2 id="titulo-acoes" className="font-heading text-lg font-semibold">
            Ações (5W2H)
          </h2>
          <fieldset>
            <legend className="sr-only">Filtrar ações</legend>
            <div className="flex flex-wrap gap-1.5">
              {FILTROS.map((f) => {
                const n = acoes.filter(f.casa).length;
                return (
                  <label
                    key={f.valor}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs hover:bg-muted/60 has-checked:border-primary has-checked:bg-primary/10 has-checked:font-medium has-checked:text-primary has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
                  >
                    <input
                      type="radio"
                      name="filtro-acoes"
                      className="sr-only"
                      checked={filtro === f.valor}
                      onChange={() => setFiltro(f.valor)}
                    />
                    {f.rotulo} <span className="tabular-nums text-muted-foreground">{n}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </div>
        {podeAdicionar && (
          <Button type="button" className="h-9" onClick={() => abrirEdicao("nova")}>
            <Plus aria-hidden="true" /> Nova ação
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <caption className="sr-only">Ações do plano no formato 5W2H</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">Prioridade</th>
              <th scope="col" className="min-w-72 px-3 py-3 font-medium">O quê / Por quê</th>
              <th scope="col" className="hidden px-3 py-3 font-medium xl:table-cell">Onde</th>
              <th scope="col" className="px-3 py-3 font-medium">Quem</th>
              <th scope="col" className="px-3 py-3 font-medium">Quando</th>
              <th scope="col" className="hidden min-w-48 px-3 py-3 font-medium 2xl:table-cell">Como</th>
              <th scope="col" className="hidden px-3 py-3 text-right font-medium lg:table-cell">Quanto</th>
              <th scope="col" className="px-3 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((a) => {
              const q = quem(a);
              return (
                <tr key={a.id} className={cn("border-b align-top last:border-0 hover:bg-muted/30", a.status === "CANCELADA" && "opacity-70")}>
                  <td className="px-4 py-3">
                    <SeloPrioridade prioridade={a.prioridade} />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-medium leading-snug">{a.oQue}</p>
                    {a.porQue && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">Por quê: {a.porQue}</p>}
                    {a.requisito && (
                      <Link
                        href={`/autoavaliacao/${a.requisito.cicloId}`}
                        className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        Requisito <span className="font-mono">{a.requisito.codigo}</span>
                      </Link>
                    )}
                    {a.marcos.length > 0 && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Marcos: {a.marcos.filter((m) => m.concluido).length}/{a.marcos.length}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 text-muted-foreground xl:table-cell">{a.onde ?? "—"}</td>
                  <td className="px-3 py-3">
                    {q.pessoa || q.unidade ? (
                      <>
                        {q.pessoa && <p>{q.pessoa}</p>}
                        {q.unidade && <p className="text-xs text-muted-foreground">{q.unidade}</p>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">A definir</span>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {a.prazo ? (
                      <>
                        <p className="tabular-nums">{formatarDataSimples(new Date(a.prazo))}</p>
                        {a.vencida && (
                          <div className="mt-1">
                            <SeloVencida dias={-diasAte(new Date(a.prazo))} />
                          </div>
                        )}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Sem prazo</span>
                    )}
                  </td>
                  <td className="hidden px-3 py-3 text-xs text-muted-foreground 2xl:table-cell">
                    <span className="line-clamp-3">{a.como ?? "—"}</span>
                  </td>
                  <td className="hidden px-3 py-3 text-right whitespace-nowrap tabular-nums lg:table-cell">
                    {formatarMoeda(a.custoEstimado)}
                  </td>
                  <td className="px-3 py-3">
                    <SeloStatusAcao status={a.status} />
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="h-1 w-16 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <span className="block h-full bg-primary" style={{ width: `${a.percentual}%` }} />
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {a.percentual}%<span className="sr-only"> executado</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      {podeValidar && ["PENDENTE", "EM_ANDAMENTO", "AGUARDANDO_VALIDACAO"].includes(a.status) && (
                        <Button
                          type="button"
                          size="sm"
                          variant={a.status === "AGUARDANDO_VALIDACAO" ? "default" : "ghost"}
                          onClick={() => setValidando(a.id)}
                          aria-label={`Validar conclusão da ação: ${a.oQue}`}
                        >
                          <CircleCheck aria-hidden="true" />
                          <span className="hidden sm:inline">Validar</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => abrirEdicao(a.id)}
                        aria-label={`Editar ação: ${a.oQue}`}
                      >
                        <Pencil aria-hidden="true" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={9} className="px-5 py-10 text-center text-muted-foreground">
                  {acoes.length === 0 ? "Nenhuma ação neste plano." : "Nenhuma ação corresponde ao filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Sheet open={editando !== null} onOpenChange={(aberto) => !aberto && fecharEdicao()}>
        <SheetContent className="w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>{acaoEditada ? "Editar ação" : "Nova ação"}</SheetTitle>
            <SheetDescription>O quê, por quê, onde, quem, quando, como e quanto custa.</SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-6">
            {editando !== null && (editando === "nova" || acaoEditada) && (
              <FormAcao
                key={`${editando}-${aberturas}`}
                planoId={planoId}
                acao={acaoEditada}
                unidades={unidades}
                onConcluido={fecharEdicao}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={validando !== null} onOpenChange={(aberto) => !aberto && fecharValidacao()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Validar conclusão</DialogTitle>
            <DialogDescription>A validação pelo controlador é o que conclui a ação.</DialogDescription>
          </DialogHeader>
          {acaoValidada && <FormValidacao key={acaoValidada.id} acao={acaoValidada} onConcluido={fecharValidacao} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}
