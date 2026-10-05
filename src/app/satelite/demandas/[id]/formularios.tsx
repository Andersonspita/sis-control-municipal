"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoAnexos } from "@/components/anexos/campo-anexos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { marcarVisualizada, pedirProrrogacao, responderDemanda } from "../../actions";

/** Registra a visualização ao abrir a página (e não em pré-carregamentos de link). */
export function MarcarVisualizada({ demandaId }: { demandaId: string }) {
  const enviado = useRef(false);
  useEffect(() => {
    if (enviado.current) return;
    enviado.current = true;
    void marcarVisualizada(demandaId);
  }, [demandaId]);
  return null;
}

export function FormResposta({ demandaId }: { demandaId: string }) {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(responderDemanda);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4" aria-busy={pendente}>
      <input type="hidden" name="demandaId" value={demandaId} />
      <div className="space-y-1.5">
        <Label htmlFor="resposta-texto">
          Sua resposta <span aria-hidden="true">*</span>
        </Label>
        <Textarea id="resposta-texto" name="texto" rows={6} required minLength={3} maxLength={10000} />
      </div>
      <CampoAnexos rotulo="Documentos" disabled={pendente} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
          Enviar resposta
        </Button>
      </div>
    </form>
  );
}

export function FormProrrogacao({ demandaId, prazoAtual, minimo }: { demandaId: string; prazoAtual: string; minimo: string }) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(pedirProrrogacao, { aoConcluir: () => setAberto(false) });
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <CalendarClock aria-hidden="true" />
        Pedir prorrogação
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Pedir prorrogação do prazo</DialogTitle>
            <DialogDescription>Prazo atual: {prazoAtual}. Até a decisão da controladoria, o prazo atual continua valendo.</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="demandaId" value={demandaId} />
          <div className="space-y-1.5">
            <Label htmlFor="prorrogacao-prazo">
              Nova data <span aria-hidden="true">*</span>
            </Label>
            <Input id="prorrogacao-prazo" name="novoPrazo" type="date" required min={minimo} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prorrogacao-texto">
              Justificativa <span aria-hidden="true">*</span>
            </Label>
            <Textarea id="prorrogacao-texto" name="texto" rows={4} required minLength={10} maxLength={5000} />
          </div>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send aria-hidden="true" />}
              Enviar pedido
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
