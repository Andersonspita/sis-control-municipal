import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  Ban,
  CheckCircle2,
  Eye,
  Flame,
  MessageSquareReply,
  Minus,
  ScanSearch,
  Send,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { Prioridade, StatusDemanda } from "@/generated/prisma/browser";
import { PRIORIDADE, STATUS_DEMANDA } from "@/lib/rotulos";
import { estaVencida } from "@/lib/demandas";
import { cn } from "@/lib/utils";

type Tom = "info" | "primary" | "alerta" | "sucesso" | "perigo" | "neutro" | "destaque";

// O texto fica sempre em text-foreground (contraste AA em todos os temas); a cor vai no fundo, na borda e no ícone.
const TONS: Record<Tom, string> = {
  info: "border-info/35 bg-info/10 [&>svg]:text-info",
  primary: "border-primary/35 bg-primary/10 [&>svg]:text-primary",
  alerta: "border-alerta/45 bg-alerta/15 [&>svg]:text-alerta",
  sucesso: "border-sucesso/35 bg-sucesso/10 [&>svg]:text-sucesso",
  perigo: "border-perigo/40 bg-perigo/10 [&>svg]:text-perigo",
  destaque: "border-destaque/45 bg-destaque/15 [&>svg]:text-destaque",
  neutro: "border-border bg-muted [&>svg]:text-muted-foreground",
};

export function Selo({ icone: Icone, tom, children, className }: { icone: LucideIcon; tom: Tom; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap text-foreground [&>svg]:size-3.5",
        TONS[tom],
        className,
      )}
    >
      <Icone aria-hidden="true" />
      {children}
    </span>
  );
}

const SITUACAO: Record<StatusDemanda, { icone: LucideIcon; tom: Tom }> = {
  ENVIADA: { icone: Send, tom: "info" },
  VISUALIZADA: { icone: Eye, tom: "info" },
  RESPONDIDA: { icone: MessageSquareReply, tom: "destaque" },
  EM_ANALISE: { icone: ScanSearch, tom: "primary" },
  DEVOLVIDA: { icone: Undo2, tom: "alerta" },
  CONCLUIDA: { icone: CheckCircle2, tom: "sucesso" },
  CANCELADA: { icone: Ban, tom: "neutro" },
};

export function SituacaoDemanda({ status, className }: { status: StatusDemanda; className?: string }) {
  const { icone, tom } = SITUACAO[status];
  return (
    <Selo icone={icone} tom={tom} className={className}>
      {STATUS_DEMANDA[status]}
    </Selo>
  );
}

export function SeloVencida() {
  return (
    <Selo icone={AlarmClock} tom="perigo">
      Vencida
    </Selo>
  );
}

/** Situação gravada e, quando for o caso, o indicador calculado de vencimento. */
export function SituacaoCompleta({ status, prazo }: { status: StatusDemanda; prazo: Date }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <SituacaoDemanda status={status} />
      {estaVencida({ status, prazo }) && <SeloVencida />}
    </span>
  );
}

const PRIORIDADES: Record<Prioridade, { icone: LucideIcon; tom: Tom }> = {
  BAIXA: { icone: ArrowDown, tom: "neutro" },
  MEDIA: { icone: Minus, tom: "neutro" },
  ALTA: { icone: ArrowUp, tom: "alerta" },
  URGENTE: { icone: Flame, tom: "perigo" },
};

export function PrioridadeDemanda({ prioridade }: { prioridade: Prioridade }) {
  const { icone, tom } = PRIORIDADES[prioridade];
  return (
    <Selo icone={icone} tom={tom}>
      <span className="sr-only">Prioridade </span>
      {PRIORIDADE[prioridade]}
    </Selo>
  );
}
