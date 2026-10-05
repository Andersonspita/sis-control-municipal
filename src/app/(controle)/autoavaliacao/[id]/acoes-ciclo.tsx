"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ListChecks, Loader2, Lock, WandSparkles } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { concluirCiclo, gerarPlano } from "../actions";

export function AcoesCiclo({
  cicloId,
  bloqueado,
  podeConcluir,
  naoAvaliados,
  lacunas,
  planoId,
}: {
  cicloId: string;
  bloqueado: boolean;
  podeConcluir: boolean;
  naoAvaliados: number;
  lacunas: number;
  planoId: string | null;
}) {
  const router = useRouter();
  const [gerando, iniciarGeracao] = useTransition();
  const [concluindo, iniciarConclusao] = useTransition();
  const [confirmar, setConfirmar] = useState(false);

  function gerar() {
    iniciarGeracao(async () => {
      const r = await gerarPlano(cicloId);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      if (r.criadas > 0) {
        toast.success(
          planoId
            ? `${r.criadas} ${r.criadas === 1 ? "nova ação adicionada" : "novas ações adicionadas"} ao plano.`
            : `Plano de ação gerado com ${r.criadas} ${r.criadas === 1 ? "ação" : "ações"}.`,
        );
      } else {
        toast.info("Nenhuma ação nova: todos os requisitos com lacuna já têm ação no plano.");
      }
      if (r.planoId) router.push(`/planos/${r.planoId}`);
    });
  }

  function concluir() {
    iniciarConclusao(async () => {
      const r = await concluirCiclo(cicloId);
      if (!r.ok) {
        toast.error(r.erro);
        return;
      }
      toast.success(r.mensagem ?? "Ciclo concluído.");
      setConfirmar(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        onClick={gerar}
        disabled={gerando || (lacunas === 0 && !planoId)}
        title={lacunas === 0 && !planoId ? "Nenhum requisito não atendido ou parcialmente atendido." : undefined}
        className="h-9"
      >
        {gerando ? <Loader2 aria-hidden="true" className="animate-spin" /> : <WandSparkles aria-hidden="true" />}
        {planoId ? "Atualizar plano de ação" : "Gerar plano de ação"}
      </Button>
      {planoId && (
        <Link href={`/planos/${planoId}`} className={buttonVariants({ variant: "outline", className: "h-9" })}>
          <ListChecks aria-hidden="true" /> Ver plano
        </Link>
      )}
      {!bloqueado && podeConcluir && (
        <Dialog open={confirmar} onOpenChange={setConfirmar}>
          <DialogTrigger render={<Button type="button" variant="outline" className="h-9" />}>
            <Lock aria-hidden="true" /> Concluir ciclo
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Concluir o ciclo?</DialogTitle>
              <DialogDescription>
                Depois de concluído, o ciclo fica congelado: nenhuma resposta poderá ser alterada. Ele servirá de base para
                comparar a evolução no próximo ciclo.
              </DialogDescription>
            </DialogHeader>
            {naoAvaliados > 0 && (
              <p className="rounded-md bg-alerta/15 px-3 py-2 text-sm text-alerta">
                Atenção: {naoAvaliados} {naoAvaliados === 1 ? "requisito continua" : "requisitos continuam"} sem avaliação e
                {naoAvaliados === 1 ? " ficará" : " ficarão"} fora do cálculo de conformidade.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmar(false)}>
                Voltar
              </Button>
              <Button type="button" onClick={concluir} disabled={concluindo}>
                {concluindo ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Lock aria-hidden="true" />}
                Concluir e congelar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
