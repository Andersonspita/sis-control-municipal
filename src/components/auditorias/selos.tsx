import {
  Ban,
  CircleCheck,
  CircleDashed,
  CircleMinus,
  CircleX,
  ClipboardPen,
  FileCheck2,
  FilePen,
  Flag,
  MessageSquareReply,
  Radar,
  Search,
  type LucideIcon,
} from "lucide-react";
import type { ResultadoItemChecklist, StatusAuditoria, StatusPlanoAuditoria } from "@/generated/prisma/browser";
import { Selo, type Tom } from "@/components/selos-status";
import { RESULTADO_ITEM_CHECKLIST, STATUS_AUDITORIA, STATUS_PLANO_AUDITORIA } from "@/lib/rotulos";

const VISUAL_STATUS: Record<StatusAuditoria, { icone: LucideIcon; tom: Tom }> = {
  PLANEJAMENTO: { icone: ClipboardPen, tom: "neutro" },
  EXECUCAO: { icone: Search, tom: "info" },
  RELATORIO_PRELIMINAR: { icone: FilePen, tom: "alerta" },
  MANIFESTACAO: { icone: MessageSquareReply, tom: "alerta" },
  RELATORIO_FINAL: { icone: FileCheck2, tom: "primario" },
  MONITORAMENTO: { icone: Radar, tom: "info" },
  ENCERRADA: { icone: Flag, tom: "sucesso" },
  CANCELADA: { icone: Ban, tom: "neutro" },
};

export function SeloStatusAuditoria({ status }: { status: StatusAuditoria }) {
  const v = VISUAL_STATUS[status];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {STATUS_AUDITORIA[status]}
    </Selo>
  );
}

export function SeloStatusPaai({ status }: { status: StatusPlanoAuditoria }) {
  return (
    <Selo icone={status === "APROVADO" ? CircleCheck : ClipboardPen} tom={status === "APROVADO" ? "sucesso" : "neutro"}>
      {STATUS_PLANO_AUDITORIA[status]}
    </Selo>
  );
}

const VISUAL_RESULTADO: Record<ResultadoItemChecklist, { icone: LucideIcon; tom: Tom }> = {
  CONFORME: { icone: CircleCheck, tom: "sucesso" },
  NAO_CONFORME: { icone: CircleX, tom: "perigo" },
  PARCIAL: { icone: CircleDashed, tom: "alerta" },
  NAO_APLICAVEL: { icone: CircleMinus, tom: "neutro" },
};

export function SeloResultadoItem({ resultado }: { resultado: ResultadoItemChecklist | null }) {
  if (!resultado) return <span className="text-xs text-muted-foreground">Não avaliado</span>;
  const v = VISUAL_RESULTADO[resultado];
  return (
    <Selo icone={v.icone} tom={v.tom}>
      {RESULTADO_ITEM_CHECKLIST[resultado]}
    </Selo>
  );
}
