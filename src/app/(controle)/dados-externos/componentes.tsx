import { percentual } from "@/lib/integracoes/formatos";
export { dataIso, moeda, percentual } from "@/lib/integracoes/formatos";
import type { FaixaLimite, SituacaoEntrega } from "@/lib/integracoes/tipos";
import type { StatusColeta } from "@/generated/prisma/enums";
import { formatarDataHora } from "@/lib/datas";
import { cn } from "@/lib/utils";


const TOM_FAIXA: Record<FaixaLimite, string> = {
  REGULAR: "bg-sucesso-fundo text-sucesso",
  ALERTA: "bg-alerta-fundo text-alerta",
  PRUDENCIAL: "bg-perigo-fundo text-perigo",
  EXCEDIDO: "bg-perigo text-white",
};

export function SeloFaixa({ faixa, children }: { faixa: FaixaLimite; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", TOM_FAIXA[faixa])}>{children}</span>;
}

const ENTREGA: Record<SituacaoEntrega, { rotulo: string; classe: string }> = {
  ENTREGUE: { rotulo: "Entregue", classe: "bg-sucesso-fundo text-sucesso" },
  PENDENTE: { rotulo: "Pendente", classe: "bg-perigo-fundo text-perigo" },
  A_VENCER: { rotulo: "A vencer", classe: "bg-info-fundo text-info" },
};

export function SeloEntrega({ situacao }: { situacao: SituacaoEntrega }) {
  const s = ENTREGA[situacao];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", s.classe)}>{s.rotulo}</span>;
}

const STATUS: Record<StatusColeta, { rotulo: string; classe: string }> = {
  PROCESSANDO: { rotulo: "Atualizando", classe: "bg-info-fundo text-info" },
  SUCESSO: { rotulo: "Atualizado", classe: "bg-sucesso-fundo text-sucesso" },
  SEM_DADOS: { rotulo: "Sem dados", classe: "bg-muted text-muted-foreground" },
  DESABILITADA: { rotulo: "Desabilitada", classe: "bg-muted text-muted-foreground" },
  ERRO: { rotulo: "Falhou", classe: "bg-perigo-fundo text-perigo" },
};

export function SeloColeta({ status, travada }: { status: StatusColeta; travada?: boolean }) {
  const s = travada ? { rotulo: "Interrompida", classe: STATUS.ERRO.classe } : STATUS[status];
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", s.classe)}>{s.rotulo}</span>;
}

/** Rodapé do cartão: fonte, recorte e data da coleta. */
export function Fonte({ nome, referencia, coletadoEm }: { nome: string; referencia?: string | null; coletadoEm?: Date | null }) {
  return (
    <p className="text-xs text-muted-foreground">
      Fonte: {nome}
      {referencia && ` · ${referencia}`}
      {coletadoEm && ` · coletado em ${formatarDataHora(coletadoEm)}`}
    </p>
  );
}

/**
 * Barra de 0 a 125% do limite máximo, com as faixas de alerta, prudencial e máximo da LRF
 * e o marcador do valor apurado.
 */
export function BarraLimite({
  valor,
  alerta,
  prudencial,
  maximo,
  rotulo,
}: {
  valor: number;
  alerta: number;
  prudencial?: number;
  maximo: number;
  rotulo: string;
}) {
  const escala = maximo * 1.25;
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / escala) * 100))}%`;
  const marcas = [
    { v: alerta, nome: "Alerta", cor: "bg-alerta-fundo border-alerta" },
    ...(prudencial ? [{ v: prudencial, nome: "Prudencial", cor: "bg-perigo-fundo border-perigo" }] : []),
    { v: maximo, nome: "Máximo", cor: "bg-perigo/70 border-perigo" },
  ];
  return (
    <figure className="space-y-2">
      <div className="relative h-4 overflow-hidden rounded-full bg-sucesso-fundo" aria-hidden="true">
        <div className="absolute inset-y-0 bg-alerta-fundo" style={{ left: pos(alerta), right: 0 }} />
        {prudencial && <div className="absolute inset-y-0 bg-perigo-fundo" style={{ left: pos(prudencial), right: 0 }} />}
        <div className="absolute inset-y-0 bg-perigo/70" style={{ left: pos(maximo), right: 0 }} />
        <div className="absolute inset-y-0 w-1.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-background" style={{ left: pos(valor) }} />
      </div>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {rotulo}: {percentual(valor)}
        </span>
        {marcas.map((m) => (
          <span key={m.nome} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm border", m.cor)} aria-hidden="true" />
            {m.nome} {percentual(m.v)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
