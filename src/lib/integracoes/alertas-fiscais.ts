// Alertas automáticos a partir dos dados coletados do SICONFI: limites da LRF para a despesa com
// pessoal (folha) e para a dívida consolidada, e demonstrativos com entrega vencida.
// Funções puras: usadas no painel, na página Alertas e em Dados externos.

import { faixaDcl, LIMITE_DCL, LIMITES_PESSOAL, PODER, ROTULO_FAIXA } from "./lrf";
import { dataIso, moeda, percentual } from "./formatos";
import type { DadosSiconfi, EntregaSiconfi, FaixaLimite } from "./tipos";

export type NivelAlertaFiscal = Exclude<FaixaLimite, "REGULAR"> | "INFO";

export type AlertaFiscal = {
  id: "pessoal" | "divida" | "entregas" | "coleta";
  nivel: NivelAlertaFiscal;
  titulo: string;
  detalhe: string;
  referencia?: string;
  /** Abre "Novo alerta" com título, descrição e gravidade preenchidos. */
  registrar?: string;
};

/** Ordem de exibição: o mais grave primeiro. */
export const PESO_NIVEL: Record<NivelAlertaFiscal, number> = { EXCEDIDO: 0, PRUDENCIAL: 1, ALERTA: 2, INFO: 3 };

export const ROTULO_NIVEL: Record<NivelAlertaFiscal, string> = {
  EXCEDIDO: "Limite máximo excedido",
  PRUDENCIAL: "Acima do prudencial",
  ALERTA: "Limite de alerta",
  INFO: "Atenção",
};

/** Link para registrar um alerta com os campos já preenchidos. */
export function linkNovoAlerta(p: { titulo: string; descricao: string; probabilidade: number; impacto: number }) {
  const qs = new URLSearchParams({
    origem: "ALERTA",
    titulo: p.titulo.slice(0, 200),
    descricao: p.descricao.slice(0, 4000),
    probabilidade: String(p.probabilidade),
    impacto: String(p.impacto),
  });
  return `/alertas/nova?${qs}`;
}

const GRAVIDADE: Record<FaixaLimite, [number, number]> = { REGULAR: [2, 3], ALERTA: [3, 4], PRUDENCIAL: [4, 4], EXCEDIDO: [5, 5] };

export function linkAlertaPessoal(s: DadosSiconfi, entidade: string) {
  const p = s.pessoal!;
  const l = LIMITES_PESSOAL[s.poder];
  const [probabilidade, impacto] = GRAVIDADE[p.faixa];
  return linkNovoAlerta({
    titulo: `Despesa com pessoal: ${ROTULO_FAIXA[p.faixa].toLowerCase()} da LRF (${p.referencia})`,
    descricao:
      `Segundo o ${p.referencia} publicado no SICONFI, a despesa total com pessoal de ${entidade} (${PODER[s.poder]}) ` +
      `somou ${moeda(p.valor)}, equivalente a ${percentual(p.percentual)} da receita corrente líquida ajustada. ` +
      `Limites da LRF: alerta ${percentual(l.alerta)} (art. 59, § 1º, II), prudencial ${percentual(l.prudencial)} (art. 22, parágrafo único) ` +
      `e máximo ${percentual(l.maximo)} (arts. 19 e 20). Avaliar as medidas de contenção e, se ultrapassado o máximo, ` +
      `a recondução no prazo do art. 23 da LRF.`,
    probabilidade,
    impacto,
  });
}

export function linkAlertaDivida(s: DadosSiconfi, entidade: string) {
  const d = s.divida!;
  const faixa = faixaDcl(d.percentualDcl ?? 0);
  const [probabilidade, impacto] = GRAVIDADE[faixa];
  return linkNovoAlerta({
    titulo: `Dívida consolidada líquida: ${ROTULO_FAIXA[faixa].toLowerCase()} (${d.referencia})`,
    descricao:
      `Segundo o ${d.referencia} publicado no SICONFI, a dívida consolidada líquida do município (${entidade}) ` +
      `corresponde a ${percentual(d.percentualDcl ?? 0)} da receita corrente líquida` +
      (d.consolidadaLiquida != null ? ` (${moeda(d.consolidadaLiquida)})` : "") +
      `. Limite de ${percentual(LIMITE_DCL.maximo)} da RCL (Res. Senado nº 40/2001) e alerta em ${percentual(LIMITE_DCL.alerta)} ` +
      `(LRF, art. 59, § 1º, III). Ultrapassado o limite, aplica-se a recondução do art. 31 da LRF.`,
    probabilidade,
    impacto,
  });
}

export function linkAlertaEntregas(pendentes: EntregaSiconfi[], entidade: string) {
  const lista = pendentes.map((e) => `- ${e.entregavel} — ${e.rotuloPeriodo} (prazo ${dataIso(e.prazo)})`).join("\n");
  return linkNovoAlerta({
    titulo: `Entregas pendentes no SICONFI (${pendentes.length})`,
    descricao:
      `O extrato de entregas do SICONFI (Tesouro Nacional) não registra os seguintes demonstrativos de ${entidade}, com prazo vencido:\n${lista}\n\n` +
      `A falta de envio impede transferências voluntárias e operações de crédito (LRF, art. 51, § 2º, e art. 55, § 3º) ` +
      `e gera restrição no CAUC. Verificar com a contabilidade o envio e a homologação.`,
    probabilidade: 4,
    impacto: pendentes.length > 2 ? 4 : 3,
  });
}

export type EntradaAlertasFiscais = {
  entidade: string;
  codigoIbge: string | null;
  siconfi: { dados: DadosSiconfi | null; erro: string | null; travada: boolean; coletadoEm: Date | null } | null;
  agora?: Date;
};

const DIAS_DESATUALIZADO = 40;

/** Alertas fiscais vigentes, do mais grave para o menos grave. */
export function calcularAlertasFiscais({ entidade, codigoIbge, siconfi, agora = new Date() }: EntradaAlertasFiscais): AlertaFiscal[] {
  const alertas: AlertaFiscal[] = [];
  const s = siconfi?.dados;

  if (!codigoIbge) {
    alertas.push({
      id: "coleta",
      nivel: "INFO",
      titulo: "Código IBGE não cadastrado",
      detalhe: "Sem o código IBGE os limites da LRF não são acompanhados. Peça ao administrador para preenchê-lo no cadastro da entidade.",
    });
  } else if (!s) {
    alertas.push({
      id: "coleta",
      nivel: "INFO",
      titulo: siconfi?.erro || siconfi?.travada ? "A coleta do SICONFI falhou" : "Dados do SICONFI ainda não coletados",
      detalhe: siconfi?.erro ?? "Use “Atualizar dados” em Dados externos para acompanhar os limites da LRF.",
    });
  } else if (siconfi?.coletadoEm && agora.getTime() - siconfi.coletadoEm.getTime() > DIAS_DESATUALIZADO * 86_400_000) {
    alertas.push({
      id: "coleta",
      nivel: "INFO",
      titulo: "Dados do SICONFI desatualizados",
      detalhe: `A última coleta tem mais de ${DIAS_DESATUALIZADO} dias. Atualize em Dados externos.`,
    });
  }

  if (s?.pessoal && s.pessoal.faixa !== "REGULAR") {
    const l = LIMITES_PESSOAL[s.poder];
    alertas.push({
      id: "pessoal",
      nivel: s.pessoal.faixa,
      titulo: `Despesa com pessoal (folha) em ${percentual(s.pessoal.percentual)} da RCL`,
      detalhe: `${ROTULO_FAIXA[s.pessoal.faixa]} — ${PODER[s.poder]}: alerta ${percentual(l.alerta)}, prudencial ${percentual(l.prudencial)}, máximo ${percentual(l.maximo)}.`,
      referencia: s.pessoal.referencia,
      registrar: linkAlertaPessoal(s, entidade),
    });
  }

  if (s?.divida?.percentualDcl != null) {
    const faixa = faixaDcl(s.divida.percentualDcl);
    if (faixa !== "REGULAR") {
      alertas.push({
        id: "divida",
        nivel: faixa,
        titulo: `Dívida consolidada líquida em ${percentual(s.divida.percentualDcl)} da RCL`,
        detalhe: `${ROTULO_FAIXA[faixa]}: alerta ${percentual(LIMITE_DCL.alerta)}, máximo ${percentual(LIMITE_DCL.maximo)} (Res. Senado nº 40/2001).`,
        referencia: s.divida.referencia,
        registrar: linkAlertaDivida(s, entidade),
      });
    }
  }

  const pendentes = s?.entregas.filter((e) => e.situacao === "PENDENTE") ?? [];
  if (pendentes.length) {
    alertas.push({
      id: "entregas",
      nivel: pendentes.length > 2 ? "PRUDENCIAL" : "ALERTA",
      titulo: `${pendentes.length} ${pendentes.length === 1 ? "demonstrativo" : "demonstrativos"} com entrega vencida no SICONFI`,
      detalhe: pendentes
        .slice(0, 4)
        .map((e) => `${e.sigla} ${e.rotuloPeriodo}`)
        .join(", ") + (pendentes.length > 4 ? "…" : "") + ". Impede transferências voluntárias (LRF, art. 51, § 2º).",
      registrar: linkAlertaEntregas(pendentes, entidade),
    });
  }

  return alertas.sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel]);
}
