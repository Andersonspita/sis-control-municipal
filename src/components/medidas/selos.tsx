import { Archive, CircleCheck, CircleDot, LoaderCircle, SignalHigh, SignalLow, SignalMedium, Siren, type LucideIcon } from "lucide-react";
import type { StatusSituacao } from "@/generated/prisma/browser";
import { Selo, type Tom } from "@/components/selos-status";
import { NIVEL_RISCO, type NivelRisco } from "@/lib/risco";
import { STATUS_SITUACAO } from "@/lib/rotulos";

export const VISUAL_GRAVIDADE: Record<NivelRisco, { icone: LucideIcon; tom: Tom; celula: string }> = {
  CRITICO: { icone: Siren, tom: "perigo", celula: "bg-perigo/15 text-perigo" },
  ALTO: { icone: SignalHigh, tom: "alerta", celula: "bg-alerta/15 text-alerta" },
  MEDIO: { icone: SignalMedium, tom: "info", celula: "bg-info/12 text-info" },
  BAIXO: { icone: SignalLow, tom: "sucesso", celula: "bg-sucesso/12 text-sucesso" },
};

export function SeloGravidade({ nivel, pontuacao }: { nivel: NivelRisco; pontuacao?: number }) {
  const v = VISUAL_GRAVIDADE[nivel];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {NIVEL_RISCO[nivel]}
      {pontuacao !== undefined && <span className="tabular-nums opacity-80">({pontuacao})</span>}
    </Selo>
  );
}

const VISUAL_STATUS: Record<StatusSituacao, { icone: LucideIcon; tom: Tom }> = {
  ABERTA: { icone: CircleDot, tom: "alerta" },
  EM_TRATAMENTO: { icone: LoaderCircle, tom: "info" },
  RESOLVIDA: { icone: CircleCheck, tom: "sucesso" },
  ARQUIVADA: { icone: Archive, tom: "neutro" },
};

export function SeloStatusSituacao({ status }: { status: StatusSituacao }) {
  const v = VISUAL_STATUS[status];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {STATUS_SITUACAO[status]}
    </Selo>
  );
}
