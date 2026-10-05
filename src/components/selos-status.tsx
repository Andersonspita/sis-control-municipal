import {
  AlarmClock,
  Archive,
  Ban,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleHelp,
  CircleMinus,
  CircleX,
  Clock,
  FilePen,
  Hourglass,
  LoaderCircle,
  Lock,
  SignalHigh,
  SignalLow,
  SignalMedium,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type {
  Prioridade,
  SituacaoRequisito,
  StatusAcao,
  StatusCiclo,
  StatusPlano,
} from "@/generated/prisma/browser";
import { PRIORIDADE, SITUACAO_REQUISITO, STATUS_ACAO, STATUS_CICLO, STATUS_PLANO } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

export type Tom = "sucesso" | "alerta" | "perigo" | "info" | "neutro" | "primario";

const CLASSE_TOM: Record<Tom, string> = {
  sucesso: "bg-sucesso/12 text-sucesso",
  alerta: "bg-alerta/15 text-alerta",
  perigo: "bg-perigo/12 text-perigo",
  info: "bg-info/12 text-info",
  neutro: "bg-muted text-muted-foreground",
  primario: "bg-primary/10 text-primary",
};

/** Selo com ícone + texto: a situação nunca é comunicada só pela cor. */
export function Selo({
  icone: Icone,
  tom,
  children,
  className,
}: {
  icone: LucideIcon;
  tom: Tom;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        CLASSE_TOM[tom],
        className,
      )}
    >
      <Icone aria-hidden="true" className="size-3.5" />
      {children}
    </span>
  );
}

export const VISUAL_SITUACAO: Record<SituacaoRequisito, { icone: LucideIcon; tom: Tom }> = {
  NAO_AVALIADO: { icone: CircleHelp, tom: "neutro" },
  ATENDIDO: { icone: CircleCheck, tom: "sucesso" },
  PARCIALMENTE_ATENDIDO: { icone: CircleDashed, tom: "alerta" },
  NAO_ATENDIDO: { icone: CircleX, tom: "perigo" },
  NAO_APLICAVEL: { icone: CircleMinus, tom: "info" },
};

export function SeloSituacao({ situacao, className }: { situacao: SituacaoRequisito; className?: string }) {
  const v = VISUAL_SITUACAO[situacao];
  return (
    <Selo icone={v.icone} tom={v.tom} className={className}>
      {SITUACAO_REQUISITO[situacao]}
    </Selo>
  );
}

const VISUAL_ACAO: Record<StatusAcao, { icone: LucideIcon; tom: Tom }> = {
  PENDENTE: { icone: Clock, tom: "neutro" },
  EM_ANDAMENTO: { icone: LoaderCircle, tom: "info" },
  AGUARDANDO_VALIDACAO: { icone: Hourglass, tom: "alerta" },
  CONCLUIDA: { icone: CircleCheck, tom: "sucesso" },
  CANCELADA: { icone: Ban, tom: "neutro" },
};

export function SeloStatusAcao({ status }: { status: StatusAcao }) {
  const v = VISUAL_ACAO[status];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {STATUS_ACAO[status]}
    </Selo>
  );
}

export function SeloVencida({ dias }: { dias?: number }) {
  return (
    <Selo icone={AlarmClock} tom="perigo">
      {dias === undefined ? "Vencida" : `Vencida há ${dias} ${dias === 1 ? "dia" : "dias"}`}
    </Selo>
  );
}

const VISUAL_CICLO: Record<StatusCiclo, { icone: LucideIcon; tom: Tom }> = {
  EM_ANDAMENTO: { icone: CircleDot, tom: "info" },
  CONCLUIDO: { icone: Lock, tom: "sucesso" },
  ARQUIVADO: { icone: Archive, tom: "neutro" },
};

export function SeloStatusCiclo({ status }: { status: StatusCiclo }) {
  const v = VISUAL_CICLO[status];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {STATUS_CICLO[status]}
    </Selo>
  );
}

const VISUAL_PLANO: Record<StatusPlano, { icone: LucideIcon; tom: Tom }> = {
  RASCUNHO: { icone: FilePen, tom: "neutro" },
  EM_EXECUCAO: { icone: LoaderCircle, tom: "info" },
  CONCLUIDO: { icone: CircleCheck, tom: "sucesso" },
  CANCELADO: { icone: Ban, tom: "neutro" },
};

export function SeloStatusPlano({ status }: { status: StatusPlano }) {
  const v = VISUAL_PLANO[status];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {STATUS_PLANO[status]}
    </Selo>
  );
}

const VISUAL_PRIORIDADE: Record<Prioridade, { icone: LucideIcon; tom: Tom }> = {
  BAIXA: { icone: SignalLow, tom: "neutro" },
  MEDIA: { icone: SignalMedium, tom: "info" },
  ALTA: { icone: SignalHigh, tom: "alerta" },
  URGENTE: { icone: TriangleAlert, tom: "perigo" },
};

export function SeloPrioridade({ prioridade }: { prioridade: Prioridade }) {
  const v = VISUAL_PRIORIDADE[prioridade];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {PRIORIDADE[prioridade]}
    </Selo>
  );
}
