import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Eye,
  Lock,
  MessageSquare,
  MessageSquareReply,
  ScanSearch,
  Send,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { StatusDemanda, TipoTramite } from "@/generated/prisma/browser";
import { formatarDataHora, formatarDataSimples } from "@/lib/datas";
import { STATUS_DEMANDA, TIPO_TRAMITE } from "@/lib/rotulos";
import { cn } from "@/lib/utils";
import { ListaAnexos, type Anexo } from "@/components/anexos/lista-anexos";

export type ItemLinhaDoTempo = {
  id: string;
  tipo: TipoTramite;
  statusAnterior: StatusDemanda | null;
  statusNovo: StatusDemanda | null;
  texto: string | null;
  novoPrazo: Date | null;
  interno: boolean;
  usuarioNome: string;
  criadoEm: Date;
  documentos: Anexo[];
};

const ICONES: Record<TipoTramite, { icone: LucideIcon; classe: string }> = {
  ENVIO: { icone: Send, classe: "bg-info/12 text-info" },
  VISUALIZACAO: { icone: Eye, classe: "bg-info/12 text-info" },
  RESPOSTA: { icone: MessageSquareReply, classe: "bg-destaque/20 text-foreground" },
  ANALISE: { icone: ScanSearch, classe: "bg-primary/12 text-primary" },
  DEVOLUCAO: { icone: Undo2, classe: "bg-alerta/18 text-foreground" },
  CONCLUSAO: { icone: CheckCircle2, classe: "bg-sucesso/12 text-sucesso" },
  CANCELAMENTO: { icone: Ban, classe: "bg-muted text-muted-foreground" },
  PRORROGACAO_SOLICITADA: { icone: CalendarClock, classe: "bg-alerta/18 text-foreground" },
  PRORROGACAO_DEFERIDA: { icone: CalendarCheck, classe: "bg-sucesso/12 text-sucesso" },
  PRORROGACAO_INDEFERIDA: { icone: CalendarX, classe: "bg-perigo/12 text-perigo" },
  COMENTARIO: { icone: MessageSquare, classe: "bg-muted text-muted-foreground" },
};

const ROTULO_PRAZO: Partial<Record<TipoTramite, string>> = {
  PRORROGACAO_SOLICITADA: "Novo prazo solicitado",
  PRORROGACAO_DEFERIDA: "Novo prazo",
  DEVOLUCAO: "Novo prazo",
};

/** Histórico imutável da demanda, do mais antigo ao mais recente. */
export function LinhaDoTempo({ itens }: { itens: ItemLinhaDoTempo[] }) {
  if (itens.length === 0) return <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>;
  return (
    <ol className="relative space-y-6 before:absolute before:top-2 before:bottom-2 before:left-4 before:w-px before:bg-border">
      {itens.map((t) => {
        const { icone: Icone, classe } = ICONES[t.tipo];
        const mudouSituacao = t.statusNovo && t.statusNovo !== t.statusAnterior;
        return (
          <li key={t.id} className="relative flex gap-4">
            <span
              aria-hidden="true"
              className={cn("relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card", classe)}
            >
              <Icone className="size-4" />
            </span>
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="font-medium">{TIPO_TRAMITE[t.tipo]}</h3>
                {t.interno && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    <Lock aria-hidden="true" className="size-3" />
                    Interno: não visível à unidade
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {t.usuarioNome} · <time dateTime={t.criadoEm.toISOString()}>{formatarDataHora(t.criadoEm)}</time>
              </p>
              {mudouSituacao && (
                <p className="text-xs text-muted-foreground">
                  Situação: {t.statusAnterior ? `${STATUS_DEMANDA[t.statusAnterior]} → ` : ""}
                  <span className="font-medium text-foreground">{STATUS_DEMANDA[t.statusNovo!]}</span>
                </p>
              )}
              {t.novoPrazo && (
                <p className="text-sm">
                  {ROTULO_PRAZO[t.tipo] ?? "Prazo"}: <span className="font-medium">{formatarDataSimples(t.novoPrazo)}</span>
                </p>
              )}
              {t.texto && (
                <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">{t.texto}</p>
              )}
              <ListaAnexos anexos={t.documentos} rotulo={`Anexos: ${TIPO_TRAMITE[t.tipo]}`} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
