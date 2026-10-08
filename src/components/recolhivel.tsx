"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { salvarRecolhidos } from "@/app/actions/preferencias";
import type { PaginaPreferencia } from "@/lib/preferencias-esquema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EstadoRecolhiveis = {
  recolhidos: ReadonlySet<string>;
  alternar: (id: string) => void;
  definirTodos: (ids: string[], recolher: boolean) => void;
};

const Contexto = createContext<EstadoRecolhiveis | null>(null);
const ATRASO_GRAVACAO_MS = 400;

/**
 * Guarda quais blocos da página estão recolhidos e grava a escolha no perfil do usuário,
 * para a página abrir da mesma forma na próxima visita (em qualquer navegador).
 */
export function ProvedorRecolhiveis({ pagina, iniciais, children }: { pagina: PaginaPreferencia; iniciais: string[]; children: React.ReactNode }) {
  const [recolhidos, setRecolhidos] = useState<ReadonlySet<string>>(() => new Set(iniciais));
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null);
  const primeira = useRef(true);

  useEffect(() => {
    // Não regrava o estado que acabou de vir do servidor.
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (pendente.current) clearTimeout(pendente.current);
    pendente.current = setTimeout(async () => {
      const r = await salvarRecolhidos(pagina, [...recolhidos]);
      if (r?.erro) toast.error(`Não foi possível salvar a exibição: ${r.erro}`);
    }, ATRASO_GRAVACAO_MS);
    return () => {
      if (pendente.current) clearTimeout(pendente.current);
    };
  }, [pagina, recolhidos]);

  const alternar = useCallback((id: string) => {
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }, []);

  const definirTodos = useCallback((ids: string[], recolher: boolean) => {
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      for (const id of ids) {
        if (recolher) novo.add(id);
        else novo.delete(id);
      }
      return novo;
    });
  }, []);

  const valor = useMemo(() => ({ recolhidos, alternar, definirTodos }), [recolhidos, alternar, definirTodos]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

function useRecolhiveis() {
  const ctx = useContext(Contexto);
  if (!ctx) throw new Error("BlocoRecolhivel precisa estar dentro de ProvedorRecolhiveis");
  return ctx;
}

/** Botões “Recolher tudo” / “Expandir tudo” para os blocos informados. */
export function AlternarTodos({ ids, className }: { ids: string[]; className?: string }) {
  const { recolhidos, definirTodos } = useRecolhiveis();
  const todosRecolhidos = ids.length > 0 && ids.every((id) => recolhidos.has(id));
  return (
    <Button type="button" variant="outline" size="lg" className={className} onClick={() => definirTodos(ids, !todosRecolhidos)}>
      {todosRecolhidos ? <ChevronsUpDown aria-hidden="true" /> : <ChevronsDownUp aria-hidden="true" />}
      {todosRecolhidos ? "Expandir tudo" : "Recolher tudo"}
    </Button>
  );
}

/**
 * Cartão com cabeçalho clicável que recolhe o conteúdo. O conteúdo continua no HTML
 * (renderizado no servidor) e só é ocultado, então expandir é instantâneo.
 */
export function BlocoRecolhivel({
  id,
  titulo,
  descricao,
  icone,
  resumo,
  acoes,
  className,
  conteudoClassName,
  children,
}: {
  id: string;
  titulo: string;
  descricao?: React.ReactNode;
  /** Ícone já renderizado (ex.: <Inbox />). */
  icone?: React.ReactNode;
  /** Texto curto exibido ao lado do título quando o bloco está recolhido (ex.: "3 alertas"). */
  resumo?: React.ReactNode;
  /** Links ou botões no cabeçalho (ficam visíveis mesmo recolhido). */
  acoes?: React.ReactNode;
  className?: string;
  conteudoClassName?: string;
  children: React.ReactNode;
}) {
  const { recolhidos, alternar } = useRecolhiveis();
  const recolhido = recolhidos.has(id);
  const idConteudo = useId();

  return (
    <Card className={cn(recolhido && "gap-0", className)} data-recolhido={recolhido || undefined} data-bloco={id}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <button
          type="button"
          onClick={() => alternar(id)}
          aria-expanded={!recolhido}
          aria-controls={idConteudo}
          className="group/rec -m-1 flex min-w-0 flex-1 items-start gap-3 rounded-md p-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {icone && (
            <span
              className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary [&_svg]:size-4"
              aria-hidden="true"
            >
              {icone}
            </span>
          )}
          <span className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {titulo}
              {recolhido && resumo && <span className="text-xs font-normal text-muted-foreground">· {resumo}</span>}
            </CardTitle>
            {descricao && !recolhido && <CardDescription>{descricao}</CardDescription>}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", recolhido && "-rotate-90")}
          />
          <span className="sr-only">{recolhido ? "(recolhido, clique para expandir)" : "(clique para recolher)"}</span>
        </button>
        {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
      </CardHeader>
      <CardContent id={idConteudo} hidden={recolhido} className={conteudoClassName}>
        {children}
      </CardContent>
    </Card>
  );
}
