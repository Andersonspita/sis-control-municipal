"use client";

import { useState } from "react";
import {
  Ban,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  CheckCircle2,
  Hourglass,
  Loader2,
  MessageSquare,
  ScanSearch,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import type { StatusDemanda } from "@/generated/prisma/browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CampoAnexos } from "@/components/anexos/campo-anexos";
import { useAcaoFormulario } from "@/components/use-acao-formulario";
import { formatarDataSimples } from "@/lib/datas";
import { STATUS_ABERTOS } from "@/lib/demandas";
import { tramitarDemanda } from "../actions";

type Pedido = { texto: string | null; novoPrazo: string | null; usuarioNome: string };

type ConfigDialogo = {
  acao: "concluir" | "devolver" | "cancelar" | "deferir" | "indeferir";
  titulo: string;
  descricao: string;
  rotulo: string;
  icone: LucideIcon;
  variante?: "default" | "outline" | "destructive" | "secondary";
  texto?: { rotulo: string; obrigatorio: boolean; dica?: string };
  prazo?: { rotulo: string; obrigatorio: boolean; padrao?: string; min: string; dica?: string };
  anexos?: boolean;
};

function DialogoTramite({ demandaId, config }: { demandaId: string; config: ConfigDialogo }) {
  const [aberto, setAberto] = useState(false);
  const { pendente, formRef, onSubmit } = useAcaoFormulario(tramitarDemanda, { aoConcluir: () => setAberto(false) });
  const Icone = config.icone;
  const prefixo = `dlg-${config.acao}`;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant={config.variante ?? "outline"} size="lg" className="w-full justify-start" />}>
        <Icone aria-hidden="true" />
        {config.rotulo}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="sm:max-w-lg">
        <form ref={formRef} onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{config.titulo}</DialogTitle>
            <DialogDescription>{config.descricao}</DialogDescription>
          </DialogHeader>
          <input type="hidden" name="acao" value={config.acao} />
          <input type="hidden" name="demandaId" value={demandaId} />
          {config.prazo && (
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixo}-prazo`}>
                {config.prazo.rotulo}
                {config.prazo.obrigatorio && <span aria-hidden="true"> *</span>}
              </Label>
              <Input
                id={`${prefixo}-prazo`}
                name="novoPrazo"
                type="date"
                required={config.prazo.obrigatorio}
                min={config.prazo.min}
                defaultValue={config.prazo.padrao}
                aria-describedby={config.prazo.dica ? `${prefixo}-prazo-dica` : undefined}
                className="h-9"
              />
              {config.prazo.dica && (
                <p id={`${prefixo}-prazo-dica`} className="text-xs text-muted-foreground">
                  {config.prazo.dica}
                </p>
              )}
            </div>
          )}
          {config.texto && (
            <div className="space-y-1.5">
              <Label htmlFor={`${prefixo}-texto`}>
                {config.texto.rotulo}
                {config.texto.obrigatorio && <span aria-hidden="true"> *</span>}
              </Label>
              <Textarea
                id={`${prefixo}-texto`}
                name="texto"
                rows={4}
                required={config.texto.obrigatorio}
                minLength={config.texto.obrigatorio ? 3 : undefined}
                maxLength={5000}
                aria-describedby={config.texto.dica ? `${prefixo}-texto-dica` : undefined}
              />
              {config.texto.dica && (
                <p id={`${prefixo}-texto-dica`} className="text-xs text-muted-foreground">
                  {config.texto.dica}
                </p>
              )}
            </div>
          )}
          {config.anexos && <CampoAnexos rotulo="Anexos (opcional)" disabled={pendente} />}
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" size="lg" />}>Voltar</DialogClose>
            <Button type="submit" size="lg" variant={config.variante === "destructive" ? "destructive" : "default"} disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Icone aria-hidden="true" />}
              {config.rotulo}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BotaoAnalisar({ demandaId }: { demandaId: string }) {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(tramitarDemanda);
  return (
    <form ref={formRef} onSubmit={onSubmit}>
      <input type="hidden" name="acao" value="analisar" />
      <input type="hidden" name="demandaId" value={demandaId} />
      <Button type="submit" size="lg" variant="secondary" className="w-full justify-start" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <ScanSearch aria-hidden="true" />}
        Iniciar análise da resposta
      </Button>
    </form>
  );
}

export function AcoesControle({
  demandaId,
  status,
  prazoAtual,
  prazoMinimo,
  pedido,
  evidenciaDe,
}: {
  demandaId: string;
  status: StatusDemanda;
  prazoAtual: string;
  prazoMinimo: string;
  pedido: Pedido | null;
  /** Ex.: "do requisito": destino dos documentos da resposta ao concluir. */
  evidenciaDe?: string;
}) {
  const aberta = STATUS_ABERTOS.includes(status);
  const aguardandoAnalise = status === "RESPONDIDA" || status === "EM_ANALISE";

  return (
    <>
      {pedido && aberta && (
        <Card className="ring-alerta/50">
          <CardHeader>
            <h2 className="flex items-center gap-2 font-heading text-base font-medium">
              <CalendarClock aria-hidden="true" className="size-4 text-alerta" />
              Pedido de prorrogação
            </h2>
            <p className="text-sm text-muted-foreground">
              {pedido.usuarioNome} pediu prorrogação
              {pedido.novoPrazo && (
                <>
                  {" "}
                  até <strong className="font-medium text-foreground">{formatarDataSimples(new Date(pedido.novoPrazo))}</strong>
                </>
              )}
              .
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {pedido.texto && <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm whitespace-pre-wrap">{pedido.texto}</p>}
            <div className="grid gap-2">
              <DialogoTramite
                demandaId={demandaId}
                config={{
                  acao: "deferir",
                  titulo: "Deferir prorrogação",
                  descricao: `O prazo atual é ${formatarDataSimples(new Date(prazoAtual))}. Confirme ou ajuste a nova data.`,
                  rotulo: "Deferir prorrogação",
                  icone: CalendarCheck,
                  variante: "default",
                  prazo: { rotulo: "Novo prazo", obrigatorio: true, padrao: pedido.novoPrazo ?? undefined, min: prazoMinimo },
                  texto: { rotulo: "Observação", obrigatorio: false },
                }}
              />
              <DialogoTramite
                demandaId={demandaId}
                config={{
                  acao: "indeferir",
                  titulo: "Indeferir prorrogação",
                  descricao: "O prazo atual será mantido. A unidade verá o motivo informado.",
                  rotulo: "Indeferir",
                  icone: CalendarX,
                  texto: { rotulo: "Motivo do indeferimento", obrigatorio: true },
                }}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-heading text-base font-medium">Ações</h2>
        </CardHeader>
        <CardContent className="grid gap-2">
          {!aberta && <p className="text-sm text-muted-foreground">Demanda encerrada. Ainda é possível registrar comentários.</p>}
          {(status === "ENVIADA" || status === "VISUALIZADA" || status === "DEVOLVIDA") && (
            <p className="flex items-start gap-2 pb-2 text-sm text-muted-foreground">
              <Hourglass aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              Aguardando resposta da unidade{status === "ENVIADA" ? " (ainda não visualizada)" : ""}.
            </p>
          )}
          {status === "RESPONDIDA" && <BotaoAnalisar demandaId={demandaId} />}
          {aguardandoAnalise && (
            <>
              <DialogoTramite
                demandaId={demandaId}
                config={{
                  acao: "concluir",
                  titulo: "Aceitar resposta e concluir",
                  descricao: `A demanda será concluída. O parecer é opcional e ficará visível para a unidade.${
                    evidenciaDe ? ` Os documentos enviados pela unidade passam a ser evidência ${evidenciaDe}.` : ""
                  }`,
                  rotulo: "Aceitar e concluir",
                  icone: CheckCircle2,
                  variante: "default",
                  texto: { rotulo: "Parecer", obrigatorio: false },
                  anexos: true,
                }}
              />
              <DialogoTramite
                demandaId={demandaId}
                config={{
                  acao: "devolver",
                  titulo: "Devolver para complementação",
                  descricao: "A unidade receberá a demanda de volta com as suas orientações.",
                  rotulo: "Devolver para complementação",
                  icone: Undo2,
                  texto: { rotulo: "O que precisa ser complementado", obrigatorio: true },
                  prazo: {
                    rotulo: "Novo prazo (opcional)",
                    obrigatorio: false,
                    min: prazoMinimo,
                    dica: "Deixe em branco para manter o prazo atual.",
                  },
                  anexos: true,
                }}
              />
            </>
          )}
          {aberta && (
            <DialogoTramite
              demandaId={demandaId}
              config={{
                acao: "cancelar",
                titulo: "Cancelar demanda",
                descricao: "A demanda deixará de exigir resposta. Esta ação não pode ser desfeita.",
                rotulo: "Cancelar demanda",
                icone: Ban,
                variante: "destructive",
                texto: { rotulo: "Motivo do cancelamento", obrigatorio: true },
              }}
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function FormComentario({ demandaId }: { demandaId: string }) {
  const { pendente, formRef, onSubmit } = useAcaoFormulario(tramitarDemanda);
  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="acao" value="comentar" />
      <input type="hidden" name="demandaId" value={demandaId} />
      <div className="space-y-1.5">
        <Label htmlFor="comentario-texto">Comentário</Label>
        <Textarea id="comentario-texto" name="texto" rows={3} required minLength={3} maxLength={5000} />
      </div>
      <div className="flex items-start gap-2 text-sm">
        <input
          id="comentario-visivel"
          type="checkbox"
          name="visivelUnidade"
          aria-describedby="comentario-visivel-dica"
          className="mt-0.5 size-4 rounded border-input accent-primary"
        />
        <div>
          <label htmlFor="comentario-visivel">Visível para a unidade destinatária</label>
          <p id="comentario-visivel-dica" className="text-xs text-muted-foreground">
            Desmarcado: fica restrito à controladoria.
          </p>
        </div>
      </div>
      <CampoAnexos rotulo="Anexos (opcional)" disabled={pendente} />
      <Button type="submit" size="lg" variant="secondary" className="w-full" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" aria-hidden="true" /> : <MessageSquare aria-hidden="true" />}
        Registrar comentário
      </Button>
    </form>
  );
}
