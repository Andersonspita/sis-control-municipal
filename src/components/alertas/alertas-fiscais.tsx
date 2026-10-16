import Link from "next/link";
import { ArrowRight, CircleCheck, Info, Siren, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AlertaAutomaticoAberto } from "@/lib/dados/alertas";
import { ROTULO_NIVEL, type AlertaFiscal, type NivelAlertaFiscal } from "@/lib/integracoes/alertas-fiscais";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const VISUAL: Record<NivelAlertaFiscal, { icone: LucideIcon; caixa: string; selo: string }> = {
  EXCEDIDO: { icone: Siren, caixa: "border-perigo/40 bg-perigo-fundo", selo: "bg-perigo text-white" },
  PRUDENCIAL: { icone: TriangleAlert, caixa: "border-perigo/30 bg-perigo-fundo", selo: "bg-perigo/15 text-perigo" },
  ALERTA: { icone: TriangleAlert, caixa: "border-alerta/40 bg-alerta-fundo", selo: "bg-alerta/20 text-alerta" },
  INFO: { icone: Info, caixa: "border-info/30 bg-info-fundo", selo: "bg-info/15 text-info" },
};

/**
 * Lista dos alertas fiscais (folha, dívida, mínimos de saúde e educação, SICONFI). Os que já viraram alerta
 * automaticamente mostram o número e o atalho para ele; os demais (ex.: indicadores do ente vistos pela Câmara)
 * podem ser registrados manualmente.
 */
export function ListaAlertasFiscais({
  alertas,
  registrados = {},
  podeRegistrar = true,
}: {
  alertas: AlertaFiscal[];
  /** Alertas automáticos em aberto, por indicador. */
  registrados?: Record<string, AlertaAutomaticoAberto>;
  podeRegistrar?: boolean;
}) {
  if (!alertas.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck aria-hidden="true" className="size-4 text-sucesso" />
        Nenhum limite da LRF em alerta, mínimos de saúde e educação atendidos e nenhuma entrega vencida no SICONFI.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alertas.map((a) => {
        const v = VISUAL[a.nivel];
        const Icone = v.icone;
        const registrado = registrados[a.id];
        return (
          <li key={a.id} className={cn("flex flex-wrap items-start gap-3 rounded-lg border px-3 py-2.5 text-foreground", v.caixa)}>
            <Icone aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {a.titulo}
                <span className={cn("rounded-full px-2 py-0.5 text-[0.7rem] font-medium", v.selo)}>{a.rotuloNivel ?? ROTULO_NIVEL[a.nivel]}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                {a.detalhe}
                {a.referencia && ` Fonte: SICONFI · ${a.referencia}.`}
              </p>
            </div>
            {registrado ? (
              <Link href={`/alertas/${registrado.id}`} className={buttonVariants({ variant: "outline", size: "sm" })} title="Registrado automaticamente">
                Alerta {registrado.numero} <ArrowRight aria-hidden="true" />
              </Link>
            ) : (
              podeRegistrar &&
              a.registrar && (
                <Link href={a.registrar} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <Siren aria-hidden="true" /> Registrar alerta
                </Link>
              )
            )}
          </li>
        );
      })}
    </ul>
  );
}
