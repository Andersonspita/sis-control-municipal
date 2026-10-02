import type { ReactNode } from "react";
import {
  Ban,
  Bell,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  CircleX,
  Clock,
  Eye,
  Hourglass,
  Reply,
  RotateCcw,
  Search,
  Send,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SeloAmeixa({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-8", className)}>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="currentColor" />
      <path d="M9 10.5h9M9 15h6M9 19.5h4" stroke="#2b2045" strokeWidth="2" strokeLinecap="round" />
      <path d="m16.5 19.5 3 3 5.5-7" fill="none" stroke="#2b2045" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MarcaAmeixa({ clara = true }: { clara?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <SeloAmeixa className="text-destaque" />
      <span className={cn("flex flex-col leading-none", clara ? "text-white" : "text-foreground")}>
        <span className="text-[0.95rem] font-bold tracking-tight">Controladoria Municipal</span>
        <span className={cn("mt-1 text-[0.68rem] font-medium tracking-wide", clara ? "text-sidebar-foreground/75" : "text-muted-foreground")}>
          Sistema de controle interno
        </span>
      </span>
    </span>
  );
}

export const codigo = "font-(family-name:--fonte-codigo)";

type Tom = "sucesso" | "alerta" | "perigo" | "info" | "primaria" | "neutro" | "destaque";

const TONS: Record<Tom, string> = {
  sucesso: "bg-sucesso/10 text-sucesso ring-sucesso/25",
  alerta: "bg-alerta/10 text-alerta ring-alerta/25",
  perigo: "bg-perigo/10 text-perigo ring-perigo/25",
  info: "bg-info/10 text-info ring-info/25",
  primaria: "bg-secondary text-secondary-foreground ring-primary/20",
  neutro: "bg-muted text-muted-foreground ring-border",
  destaque: "bg-destaque/20 text-destaque-foreground ring-destaque/50",
};

export const SITUACOES = {
  naoAvaliado: { rotulo: "Não avaliado", icone: CircleDashed, tom: "neutro" },
  atende: { rotulo: "Atende", icone: CircleCheck, tom: "sucesso" },
  parcial: { rotulo: "Atende parcialmente", icone: CircleAlert, tom: "alerta" },
  naoAtende: { rotulo: "Não atende", icone: CircleX, tom: "perigo" },
  naoSeAplica: { rotulo: "Não se aplica", icone: CircleMinus, tom: "neutro" },
  enviada: { rotulo: "Enviada", icone: Send, tom: "info" },
  visualizada: { rotulo: "Visualizada", icone: Eye, tom: "info" },
  respondida: { rotulo: "Respondida", icone: Reply, tom: "primaria" },
  emAnalise: { rotulo: "Em análise", icone: Hourglass, tom: "alerta" },
  devolvida: { rotulo: "Devolvida", icone: RotateCcw, tom: "alerta" },
  concluida: { rotulo: "Concluída", icone: CircleCheck, tom: "sucesso" },
  cancelada: { rotulo: "Cancelada", icone: Ban, tom: "neutro" },
  vencida: { rotulo: "Vencida", icone: Clock, tom: "perigo" },
  naoIniciada: { rotulo: "Não iniciada", icone: CircleDashed, tom: "neutro" },
  emAndamento: { rotulo: "Em andamento", icone: CircleDot, tom: "info" },
  atrasada: { rotulo: "Atrasada", icone: Clock, tom: "perigo" },
} satisfies Record<string, { rotulo: string; icone: LucideIcon; tom: Tom }>;

export type ChaveSituacao = keyof typeof SITUACOES;

export function Situacao({ s, className }: { s: ChaveSituacao; className?: string }) {
  const { rotulo, icone: Icone, tom } = SITUACOES[s];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset", TONS[tom], className)}>
      <Icone aria-hidden="true" className="size-3.5" />
      {rotulo}
    </span>
  );
}

const PRIORIDADES = {
  baixa: { rotulo: "Baixa", barras: 1, cor: "bg-muted-foreground" },
  media: { rotulo: "Média", barras: 2, cor: "bg-info" },
  alta: { rotulo: "Alta", barras: 3, cor: "bg-alerta" },
  urgente: { rotulo: "Urgente", barras: 4, cor: "bg-perigo" },
} as const;

export function Prioridade({ p }: { p: keyof typeof PRIORIDADES }) {
  const { rotulo, barras, cor } = PRIORIDADES[p];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((n) => (
          <span key={n} className={cn("w-1 rounded-sm", n <= barras ? cor : "bg-border")} style={{ height: 4 + n * 2.5 }} />
        ))}
      </span>
      {rotulo}
    </span>
  );
}

export function Risco({ nivel }: { nivel: "baixo" | "medio" | "alto" | "critico" }) {
  const mapa = {
    baixo: { r: "Baixo", t: "sucesso", f: "< 6" },
    medio: { r: "Médio", t: "info", f: "6–9" },
    alto: { r: "Alto", t: "alerta", f: "10–14" },
    critico: { r: "Crítico", t: "perigo", f: "≥ 15" },
  } as const;
  const { r, t, f } = mapa[nivel];
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs font-semibold ring-1 ring-inset", TONS[t])}>
      <span className="size-2 rotate-45 bg-current" aria-hidden="true" />
      {r} <span className={cn("font-normal opacity-80", codigo)}>{f}</span>
    </span>
  );
}

export function Moldura({ titulo, url, children, className }: { titulo: string; url: string; children: ReactNode; className?: string }) {
  return (
    <figure className={cn("overflow-hidden rounded-xl border border-[#d6d1df] bg-background shadow-(--sombra-md)", className)}>
      <div className="flex items-center gap-3 border-b bg-[#ecebf0] px-4 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#d6d1df]" />
          <span className="size-2.5 rounded-full bg-[#d6d1df]" />
          <span className="size-2.5 rounded-full bg-[#d6d1df]" />
        </span>
        <span className={cn("flex-1 truncate rounded-md bg-white px-3 py-0.5 text-[0.7rem] text-muted-foreground", codigo)}>{url}</span>
        <figcaption className="text-[0.7rem] font-semibold text-muted-foreground">{titulo}</figcaption>
      </div>
      {children}
    </figure>
  );
}

const GRUPOS = [
  { rotulo: "Painel", itens: [] as string[] },
  { rotulo: "Conformidade", itens: ["Normas", "Autoavaliação", "Planos de ação"] },
  { rotulo: "Atuação", itens: ["Demandas", "Auditorias", "Medidas"] },
  { rotulo: "Gestão", itens: ["Documentos", "Relatórios", "Unidades", "Trilha de auditoria"] },
];

export function BarraTopo({ grupo, item }: { grupo: string; item?: string }) {
  const ativo = GRUPOS.find((g) => g.rotulo === grupo);
  return (
    <header>
      <div className="flex h-14 items-center gap-6 bg-sidebar px-6 text-sidebar-foreground">
        <MarcaAmeixa />
        <nav aria-label="Menu principal" className="flex h-full items-stretch gap-1">
          {GRUPOS.map((g) => (
            <span
              key={g.rotulo}
              className={cn(
                "relative flex items-center px-3 text-sm font-semibold",
                g.rotulo === grupo
                  ? "text-white after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-sidebar-primary"
                  : "text-sidebar-foreground/80",
              )}
              aria-current={g.rotulo === grupo ? "page" : undefined}
            >
              {g.rotulo}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="flex h-9 w-56 items-center gap-2 rounded-md bg-sidebar-accent px-3 text-xs text-sidebar-foreground/75">
            <Search aria-hidden="true" className="size-4" /> Buscar requisito, demanda…
          </span>
          <span className="relative flex size-9 items-center justify-center rounded-md text-sidebar-foreground" aria-label="3 notificações">
            <Bell aria-hidden="true" className="size-[18px]" />
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-destaque ring-2 ring-sidebar" />
          </span>
          <span className="flex items-center gap-2.5 rounded-md border border-sidebar-border px-2.5 py-1">
            <span className="flex flex-col text-right leading-tight">
              <span className="text-xs font-semibold text-white">Prefeitura Municipal de Exemplo</span>
              <span className="text-[0.68rem] text-sidebar-foreground/75">Prefeitura · Município Exemplo/BA</span>
            </span>
            <ChevronDown aria-hidden="true" className="size-4" />
          </span>
          <span className="flex size-9 items-center justify-center rounded-full bg-destaque text-xs font-bold text-destaque-foreground">MC</span>
        </div>
      </div>
      {ativo && ativo.itens.length > 0 && (
        <nav aria-label={`Seção ${grupo}`} className="flex h-11 items-stretch gap-1 border-b bg-card px-6">
          {ativo.itens.map((i) => (
            <span
              key={i}
              className={cn(
                "relative flex items-center px-3 text-sm",
                i === item
                  ? "font-semibold text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground",
              )}
            >
              {i}
            </span>
          ))}
        </nav>
      )}
    </header>
  );
}

export function Trilha({ partes }: { partes: string[] }) {
  return (
    <p className="text-xs text-muted-foreground">
      {partes.map((p, i) => (
        <span key={p}>
          {i > 0 && <span className="mx-1.5" aria-hidden="true">/</span>}
          <span className={i === partes.length - 1 ? "font-semibold text-foreground" : undefined}>{p}</span>
        </span>
      ))}
    </p>
  );
}

export function Cartao({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-(--radius) border bg-card shadow-(--sombra-sm)", className)}>{children}</div>;
}

export function Barra({ valor, className, cor = "bg-primary" }: { valor: number; className?: string; cor?: string }) {
  return (
    <span className={cn("block h-2 overflow-hidden rounded-full bg-muted", className)} role="img" aria-label={`${valor}%`}>
      <span className={cn("block h-full rounded-full", cor)} style={{ width: `${valor}%` }} />
    </span>
  );
}
