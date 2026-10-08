import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlarmClock,
  CircleCheck,
  ClipboardCheck,
  ClipboardList,
  Hourglass,
  Inbox,
  Landmark,
  ListTodo,
  MessageSquareReply,
  Network,
  Scale,
  TrendingUp,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import type { resumoPainel } from "@/lib/dados/painel";
import type { DadosExternos } from "@/lib/dados/integracoes";
import { formatarPercentual } from "@/lib/dados/conformidade";
import { faixaDcl, LIMITE_DCL, LIMITES_PESSOAL, poderDaEntidade, ROTULO_FAIXA } from "@/lib/integracoes/lrf";
import { moeda, percentual } from "@/lib/integracoes/formatos";
import type { FaixaLimite } from "@/lib/integracoes/tipos";
import { NIVEIS_RISCO, NIVEL_RISCO } from "@/lib/risco";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { VISUAL_GRAVIDADE } from "@/components/alertas/selos";
import { SeloStatusCiclo } from "@/components/selos-status";
import { Progress } from "@/components/ui/progress";
import { SeloFaixa } from "../dados-externos/componentes";
import { GradeIndicadores, Indicador, LinkPagina, type Tom } from "./indicadores";

type Resumo = Awaited<ReturnType<typeof resumoPainel>>;

const TRAMITE: Record<string, string> = {
  ENVIO: "enviou a demanda",
  VISUALIZACAO: "visualizou",
  RESPOSTA: "respondeu",
  ANALISE: "iniciou a análise",
  DEVOLUCAO: "devolveu para complementação",
  CONCLUSAO: "concluiu",
  CANCELAMENTO: "cancelou",
  PRORROGACAO_SOLICITADA: "pediu prorrogação",
  PRORROGACAO_DEFERIDA: "deferiu a prorrogação",
  PRORROGACAO_INDEFERIDA: "indeferiu a prorrogação",
  COMENTARIO: "comentou",
};

const TOM_FAIXA: Record<FaixaLimite, Tom> = {
  REGULAR: "sucesso",
  ALERTA: "alerta",
  PRUDENCIAL: "perigo",
  EXCEDIDO: "perigo",
};

/** Média simples dos índices de aderência das normas já avaliadas. */
function aderenciaMedia(r: Resumo) {
  const avaliadas = r.aderencia.filter((n) => n.indice !== null);
  if (!avaliadas.length) return { indice: null, normas: 0 };
  return {
    indice: avaliadas.reduce((s, n) => s + (n.indice ?? 0), 0) / avaliadas.length,
    normas: avaliadas.length,
  };
}

export function ConteudoIndices({ r, d }: { r: Resumo; d: DadosExternos }) {
  const sic = d.siconfi?.dados;
  const poder = sic?.poder ?? poderDaEntidade(d.cliente.tipo);
  const limites = LIMITES_PESSOAL[poder];
  const pendentes = sic?.entregas.filter((e) => e.situacao === "PENDENTE").length ?? 0;
  const dcl = sic?.divida?.percentualDcl ?? null;
  const media = aderenciaMedia(r);
  const rp = sic?.resultadoPrimario;

  return (
    <GradeIndicadores>
      <Indicador
        rotulo={`Despesa com pessoal (${poder === "L" ? "Legislativo" : "Executivo"})`}
        valor={sic?.pessoal ? percentual(sic.pessoal.percentual) : "—"}
        icone={Landmark}
        tom={sic?.pessoal ? TOM_FAIXA[sic.pessoal.faixa] : "neutro"}
        href="/dados-externos"
        detalhe={
          sic?.pessoal ? (
            <SeloFaixa faixa={sic.pessoal.faixa}>{ROTULO_FAIXA[sic.pessoal.faixa]}</SeloFaixa>
          ) : (
            `Limite máximo ${percentual(limites.maximo)} da RCL`
          )
        }
      />
      <Indicador
        rotulo="Dívida consolidada líquida / RCL"
        valor={dcl !== null ? percentual(dcl) : "—"}
        icone={Scale}
        tom={dcl !== null ? TOM_FAIXA[faixaDcl(dcl)] : "neutro"}
        href="/dados-externos"
        detalhe={
          sic?.divida?.consolidada != null
            ? `Dívida consolidada ${moeda(sic.divida.consolidada)} · limite ${percentual(LIMITE_DCL.maximo)}`
            : `Limite ${percentual(LIMITE_DCL.maximo)} da RCL`
        }
      />
      <Indicador
        rotulo="Receita corrente líquida"
        valor={sic?.rcl ? moeda(sic.rcl.valor) : "—"}
        icone={Wallet}
        href="/dados-externos"
        detalhe={sic?.rcl ? `Últimos 12 meses · ${sic.rcl.referencia}` : "SICONFI"}
      />
      <Indicador
        rotulo="Resultado primário acumulado"
        valor={rp ? moeda(rp.valor) : "—"}
        icone={TrendingUp}
        tom={rp?.meta != null ? (rp.valor >= rp.meta ? "sucesso" : "alerta") : "neutro"}
        href="/dados-externos"
        detalhe={rp?.meta != null ? `Meta da LDO ${moeda(rp.meta)}` : (rp?.referencia ?? "SICONFI")}
      />
      <Indicador
        rotulo="Entregas SICONFI pendentes"
        valor={sic ? pendentes : "—"}
        icone={TriangleAlert}
        tom={pendentes ? "perigo" : sic ? "sucesso" : "neutro"}
        href="/dados-externos"
        detalhe={sic ? (pendentes ? "Com prazo vencido" : "Nenhuma pendência") : "SICONFI"}
      />
      <Indicador
        rotulo="Aderência média às normas"
        valor={formatarPercentual(media.indice)}
        icone={ClipboardCheck}
        href="/autoavaliacao"
        detalhe={media.normas ? `${media.normas} norma(s) com ciclo avaliado` : "Nenhum ciclo avaliado"}
      />
    </GradeIndicadores>
  );
}

export function ConteudoAlertas({ r }: { r: Resumo }) {
  return (
    <div className="space-y-4">
      <GradeIndicadores className="xl:grid-cols-2 2xl:grid-cols-2">
        {NIVEIS_RISCO.map((n) => {
          const v = VISUAL_GRAVIDADE[n];
          return (
            <Indicador
              key={n}
              rotulo={`Abertos · ${NIVEL_RISCO[n].toLowerCase()}`}
              valor={r.alertas.porNivel[n]}
              icone={v.icone}
              tom={r.alertas.porNivel[n] ? (v.tom === "info" ? "neutro" : (v.tom as Tom)) : "neutro"}
              href={`/alertas?status=ABERTAS&gravidade=${n}`}
            />
          );
        })}
      </GradeIndicadores>
      <p className="text-sm text-muted-foreground">
        {r.alertas.emAberto} alerta(s) em aberto ·{" "}
        <span className={r.alertas.acoesVencidas ? "font-medium text-perigo" : undefined}>
          {r.alertas.acoesVencidas} ação(ões) vencida(s) nos planos
        </span>
      </p>
      <LinkPagina href="/alertas">Ver alertas</LinkPagina>
    </div>
  );
}

export function ConteudoDemandas({ r }: { r: Resumo }) {
  return (
    <GradeIndicadores className="xl:grid-cols-4">
      <Indicador rotulo="Demandas em aberto" valor={r.demandasAbertas} icone={Inbox} href="/demandas" />
      <Indicador
        rotulo="Demandas vencidas"
        valor={r.demandasVencidas}
        icone={AlarmClock}
        tom={r.demandasVencidas ? "perigo" : "neutro"}
        detalhe="Prazo expirado e ainda não concluídas"
        href="/demandas"
      />
      <Indicador
        rotulo="Respostas a analisar"
        valor={r.aguardandoAnalise}
        icone={MessageSquareReply}
        tom={r.aguardandoAnalise ? "alerta" : "neutro"}
        href="/demandas"
      />
      <Indicador
        rotulo="Ações em execução"
        valor={r.acoesPendentes}
        icone={ClipboardList}
        tom={r.acoesAtrasadas ? "perigo" : "neutro"}
        detalhe={r.acoesAtrasadas ? `${r.acoesAtrasadas} com prazo vencido` : "Nenhuma atrasada"}
        href="/planos"
      />
    </GradeIndicadores>
  );
}

export function ConteudoAderencia({ r, tipo }: { r: Resumo; tipo: keyof typeof TIPO_CLIENTE }) {
  return (
    <div className="space-y-5">
      {r.aderencia.map((n) => (
        <div key={n.normaId} className="space-y-2">
          <div className="flex items-baseline justify-between gap-4">
            <Link href={n.ciclo ? `/autoavaliacao/${n.ciclo.id}` : `/normas/${n.normaId}`} className="font-medium hover:underline">
              {n.titulo}
            </Link>
            <span className="shrink-0 text-sm font-medium tabular-nums">
              {n.indice === null ? <span className="font-normal text-muted-foreground">sem avaliação</span> : formatarPercentual(n.indice)}
            </span>
          </div>
          <Progress value={n.percentual ?? 0} aria-label={`Aderência à ${n.codigo}`} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {n.ciclo ? (
              <>
                <SeloStatusCiclo status={n.ciclo.status} />
                <span>
                  {n.ciclo.nome}: {n.avaliados} de {n.totalRequisitos} requisitos avaliados
                </span>
                {(n.contagem.NAO_ATENDIDO > 0 || n.contagem.PARCIALMENTE_ATENDIDO > 0) && (
                  <span>
                    · {n.contagem.NAO_ATENDIDO} não atendidos, {n.contagem.PARCIALMENTE_ATENDIDO} parciais
                  </span>
                )}
              </>
            ) : (
              <span>
                {n.totalRequisitos} requisitos aplicáveis ao tipo {TIPO_CLIENTE[tipo]}. Nenhum ciclo iniciado.
              </span>
            )}
          </div>
        </div>
      ))}
      <LinkPagina href="/autoavaliacao">Ir para a autoavaliação</LinkPagina>
    </div>
  );
}

export function ConteudoMovimentacoes({ r }: { r: Resumo }) {
  if (!r.recentes.length) return <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>;
  return (
    <ol className="space-y-4">
      {r.recentes.map((t) => (
        <li key={t.id} className="flex gap-3 text-sm">
          <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            <p>
              <span className="font-medium">{t.usuarioNome}</span> {TRAMITE[t.tipo] ?? t.tipo}
            </p>
            <p className="truncate text-muted-foreground">
              Demanda {String(t.demanda.numero).padStart(3, "0")}/{t.demanda.ano} — {t.demanda.assunto}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatDistanceToNow(t.criadoEm, {
                addSuffix: true,
                locale: ptBR,
              })}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ConteudoPlanos({ r }: { r: Resumo }) {
  return (
    <div className="space-y-4">
      <GradeIndicadores className="xl:grid-cols-4">
        <Indicador rotulo="Abertas" valor={r.acoes.abertas} icone={ListTodo} href="/planos" />
        <Indicador rotulo="Vencidas" valor={r.acoes.vencidas} icone={AlarmClock} tom={r.acoes.vencidas ? "perigo" : "neutro"} href="/planos" />
        <Indicador
          rotulo="Aguardando validação"
          valor={r.acoes.aguardandoValidacao}
          icone={Hourglass}
          tom={r.acoes.aguardandoValidacao ? "alerta" : "neutro"}
          href="/planos"
        />
        <Indicador
          rotulo="Concluídas"
          valor={r.acoes.concluidas}
          icone={CircleCheck}
          tom={r.acoes.concluidas ? "sucesso" : "neutro"}
          href="/planos"
        />
      </GradeIndicadores>
      <LinkPagina href="/planos">Ver planos de ação</LinkPagina>
    </div>
  );
}

export function ConteudoTransferencias({ d }: { d: DadosExternos }) {
  const portal = d.portal?.dados;
  if (!portal) {
    return <p className="text-sm text-muted-foreground">{d.portal?.erro ?? "Ainda não coletado. Atualize em Dados externos."}</p>;
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground">
            Recebido em {portal.ano} (01 a {String(portal.mesFim).padStart(2, "0")})
          </p>
          <p className="font-heading text-xl font-semibold tabular-nums">{moeda(portal.recursos.total)}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Convênios vigentes</p>
          <p className="font-heading text-xl font-semibold tabular-nums">{portal.convenios.vigentes}</p>
          <p className="text-xs text-muted-foreground">{moeda(portal.convenios.valorVigentes)} pactuados</p>
        </div>
      </div>
      {portal.recursos.porOrgao.length > 0 && (
        <ul className="space-y-1 text-sm">
          {portal.recursos.porOrgao.slice(0, 3).map((o) => (
            <li key={o.orgao} className="flex justify-between gap-4">
              <span className="truncate">{o.orgao}</span>
              <span className="shrink-0 tabular-nums">{moeda(o.valor)}</span>
            </li>
          ))}
        </ul>
      )}
      <LinkPagina href="/dados-externos">Ver dados externos</LinkPagina>
    </div>
  );
}

export function ConteudoUnidades({ r }: { r: Resumo }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Network aria-hidden="true" className="size-5" />
        </span>
        <p className="font-medium">{r.unidades} unidades cadastradas</p>
      </div>
      <LinkPagina href="/unidades">Gerenciar unidades</LinkPagina>
    </div>
  );
}
