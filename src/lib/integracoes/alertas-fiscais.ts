// Alertas automáticos a partir dos dados coletados do SICONFI: limites da LRF (despesa com pessoal e dívida
// consolidada), mínimos constitucionais (educação, FUNDEB e saúde), meta de resultado primário e
// demonstrativos com entrega vencida. Funções puras: usadas nas telas e na criação automática dos alertas
// (src/lib/integracoes/alertas-automaticos.ts), que roda a cada coleta.

import { faixaDcl, LIMITE_DCL, LIMITES_PESSOAL, PODER, ROTULO_FAIXA } from "./lrf";
import { dataIso, moeda, percentual } from "./formatos";
import type { AplicacaoMinima, DadosSiconfi, EntregaSiconfi, FaixaLimite } from "./tipos";

export type NivelAlertaFiscal = Exclude<FaixaLimite, "REGULAR"> | "INFO";

export type IdAlertaFiscal = "pessoal" | "divida" | "entregas" | "educacao" | "fundeb" | "saude" | "resultado-primario" | "coleta";

/** Dados para registrar o alerta como situação (manual, pelo link, ou automaticamente). */
export type RegistroAlerta = { titulo: string; descricao: string; probabilidade: number; impacto: number };

export type AlertaFiscal = {
  id: IdAlertaFiscal;
  nivel: NivelAlertaFiscal;
  /** Texto do selo, quando o padrão do nível não se aplica (ex.: mínimos constitucionais). */
  rotuloNivel?: string;
  titulo: string;
  detalhe: string;
  referencia?: string;
  /** Indicador do ente (Executivo): a Câmara vê, mas não recebe alerta automático por ele. */
  doEnte?: boolean;
  /** Identifica o período/conteúdo do alerta: muda quando sai um novo demonstrativo. */
  referenciaAutomatica?: string;
  registro?: RegistroAlerta;
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
export function linkNovoAlerta(p: RegistroAlerta) {
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

export function registroPessoal(s: DadosSiconfi, entidade: string): RegistroAlerta {
  const p = s.pessoal!;
  const l = LIMITES_PESSOAL[s.poder];
  const [probabilidade, impacto] = GRAVIDADE[p.faixa];
  return {
    titulo: `Despesa com pessoal: ${ROTULO_FAIXA[p.faixa].toLowerCase()} da LRF (${p.referencia})`,
    descricao:
      `Segundo o ${p.referencia} publicado no SICONFI, a despesa total com pessoal de ${entidade} (${PODER[s.poder]}) ` +
      `somou ${moeda(p.valor)}, equivalente a ${percentual(p.percentual)} da receita corrente líquida ajustada. ` +
      `Limites da LRF: alerta ${percentual(l.alerta)} (art. 59, § 1º, II), prudencial ${percentual(l.prudencial)} (art. 22, parágrafo único) ` +
      `e máximo ${percentual(l.maximo)} (arts. 19 e 20). Avaliar as medidas de contenção e, se ultrapassado o máximo, ` +
      `a recondução no prazo do art. 23 da LRF.`,
    probabilidade,
    impacto,
  };
}

export function registroDivida(s: DadosSiconfi, entidade: string): RegistroAlerta {
  const d = s.divida!;
  const faixa = faixaDcl(d.percentualDcl ?? 0);
  const [probabilidade, impacto] = GRAVIDADE[faixa];
  return {
    titulo: `Dívida consolidada líquida: ${ROTULO_FAIXA[faixa].toLowerCase()} (${d.referencia})`,
    descricao:
      `Segundo o ${d.referencia} publicado no SICONFI, a dívida consolidada líquida do município (${entidade}) ` +
      `corresponde a ${percentual(d.percentualDcl ?? 0)} da receita corrente líquida` +
      (d.consolidadaLiquida != null ? ` (${moeda(d.consolidadaLiquida)})` : "") +
      `. Limite de ${percentual(LIMITE_DCL.maximo)} da RCL (Res. Senado nº 40/2001) e alerta em ${percentual(LIMITE_DCL.alerta)} ` +
      `(LRF, art. 59, § 1º, III). Ultrapassado o limite, aplica-se a recondução do art. 31 da LRF.`,
    probabilidade,
    impacto,
  };
}

export function registroEntregas(pendentes: EntregaSiconfi[], entidade: string): RegistroAlerta {
  const lista = pendentes.map((e) => `- ${e.entregavel} — ${e.rotuloPeriodo} (prazo ${dataIso(e.prazo)})`).join("\n");
  return {
    titulo: `Entregas pendentes no SICONFI (${pendentes.length})`,
    descricao:
      `O extrato de entregas do SICONFI (Tesouro Nacional) não registra os seguintes demonstrativos de ${entidade}, com prazo vencido:\n${lista}\n\n` +
      `A falta de envio impede transferências voluntárias e operações de crédito (LRF, art. 51, § 2º, e art. 55, § 3º) ` +
      `e gera restrição no CAUC. Verificar com a contabilidade o envio e a homologação.`,
    probabilidade: 4,
    impacto: pendentes.length > 2 ? 4 : 3,
  };
}

export const linkAlertaPessoal = (s: DadosSiconfi, entidade: string) => linkNovoAlerta(registroPessoal(s, entidade));
export const linkAlertaDivida = (s: DadosSiconfi, entidade: string) => linkNovoAlerta(registroDivida(s, entidade));
export const linkAlertaEntregas = (pendentes: EntregaSiconfi[], entidade: string) => linkNovoAlerta(registroEntregas(pendentes, entidade));

/** Mínimos constitucionais lidos no RREO Anexo 14. */
const MINIMOS = {
  educacao: {
    nome: "Manutenção e desenvolvimento do ensino",
    curto: "educação (MDE)",
    base: "receitas de impostos e transferências (CF, art. 212)",
    efeito: "O descumprimento sujeita o ente à intervenção do Estado (CF, art. 35, III) e à rejeição das contas.",
  },
  fundeb: {
    nome: "FUNDEB na remuneração dos profissionais da educação",
    curto: "FUNDEB (remuneração)",
    base: "recursos anuais do FUNDEB (Lei nº 14.113/2020, art. 26)",
    efeito: "O percentual é apurado no exercício; o saldo não aplicado deve ser regularizado conforme a Lei nº 14.113/2020.",
  },
  saude: {
    nome: "Ações e serviços públicos de saúde",
    curto: "saúde (ASPS)",
    base: "receitas de impostos e transferências (LC nº 141/2012, art. 7º)",
    efeito: "A diferença não aplicada deve ser compensada no exercício seguinte (LC nº 141/2012, art. 25), sem prejuízo das sanções.",
  },
} as const;

type IdMinimo = keyof typeof MINIMOS;

function alertaMinimo(id: IdMinimo, a: AplicacaoMinima, s: DadosSiconfi, entidade: string): AlertaFiscal | null {
  if (a.aplicado >= a.minimo) return null;
  const m = MINIMOS[id];
  const execucao = s.execucao!;
  const final = execucao.final;
  const titulo = `${m.nome}: ${percentual(a.aplicado)} aplicado (mínimo ${percentual(a.minimo)})`;
  return {
    id,
    nivel: final ? "EXCEDIDO" : "ALERTA",
    rotuloNivel: final ? "Mínimo descumprido" : "Abaixo do mínimo até o bimestre",
    titulo,
    detalhe: final
      ? `No encerramento do exercício, a aplicação em ${m.curto} ficou abaixo do mínimo constitucional.`
      : `Acumulado até o bimestre abaixo do mínimo anual: acompanhe para não descumprir no fim do exercício.`,
    referencia: execucao.referencia,
    doEnte: true,
    referenciaAutomatica: execucao.referencia,
    registro: {
      titulo: `${final ? "Descumprimento" : "Risco de descumprimento"} do mínimo em ${m.curto} (${execucao.referencia})`,
      descricao:
        `Segundo o ${execucao.referencia} publicado no SICONFI (RREO, Anexo 14), o município (${entidade}) aplicou ` +
        `${percentual(a.aplicado)}${a.valor != null ? ` (${moeda(a.valor)})` : ""} em ${m.nome.toLowerCase()}, ` +
        `${final ? "no exercício" : "acumulado até o bimestre"}, frente ao mínimo de ${percentual(a.minimo)} das ${m.base}. ` +
        (final ? m.efeito : "Recomenda-se acompanhar a programação das despesas para atingir o mínimo até o fim do exercício."),
      probabilidade: final ? 5 : 3,
      impacto: final ? 5 : 4,
    },
  };
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
      detalhe: siconfi?.erro ?? "A coleta automática roda diariamente; os alertas aparecem aqui assim que os dados chegarem.",
    });
  } else if (siconfi?.coletadoEm && agora.getTime() - siconfi.coletadoEm.getTime() > DIAS_DESATUALIZADO * 86_400_000) {
    alertas.push({
      id: "coleta",
      nivel: "INFO",
      titulo: "Dados do SICONFI desatualizados",
      detalhe: `A última coleta tem mais de ${DIAS_DESATUALIZADO} dias. Verifique a coleta automática ou atualize em Dados externos.`,
    });
  }
  if (!s) return alertas;

  if (s.pessoal && s.pessoal.faixa !== "REGULAR") {
    const l = LIMITES_PESSOAL[s.poder];
    const registro = registroPessoal(s, entidade);
    alertas.push({
      id: "pessoal",
      nivel: s.pessoal.faixa,
      titulo: `Despesa com pessoal (folha) em ${percentual(s.pessoal.percentual)} da RCL`,
      detalhe: `${ROTULO_FAIXA[s.pessoal.faixa]} — ${PODER[s.poder]}: alerta ${percentual(l.alerta)}, prudencial ${percentual(l.prudencial)}, máximo ${percentual(l.maximo)}.`,
      referencia: s.pessoal.referencia,
      referenciaAutomatica: s.pessoal.referencia,
      registro,
      registrar: linkNovoAlerta(registro),
    });
  }

  if (s.divida?.percentualDcl != null) {
    const faixa = faixaDcl(s.divida.percentualDcl);
    if (faixa !== "REGULAR") {
      const registro = registroDivida(s, entidade);
      alertas.push({
        id: "divida",
        nivel: faixa,
        titulo: `Dívida consolidada líquida em ${percentual(s.divida.percentualDcl)} da RCL`,
        detalhe: `${ROTULO_FAIXA[faixa]}: alerta ${percentual(LIMITE_DCL.alerta)}, máximo ${percentual(LIMITE_DCL.maximo)} (Res. Senado nº 40/2001).`,
        referencia: s.divida.referencia,
        doEnte: true,
        referenciaAutomatica: s.divida.referencia,
        registro,
        registrar: linkNovoAlerta(registro),
      });
    }
  }

  const pendentes = s.entregas.filter((e) => e.situacao === "PENDENTE");
  if (pendentes.length) {
    const registro = registroEntregas(pendentes, entidade);
    alertas.push({
      id: "entregas",
      nivel: pendentes.length > 2 ? "PRUDENCIAL" : "ALERTA",
      titulo: `${pendentes.length} ${pendentes.length === 1 ? "demonstrativo" : "demonstrativos"} com entrega vencida no SICONFI`,
      detalhe:
        pendentes
          .slice(0, 4)
          .map((e) => `${e.sigla} ${e.rotuloPeriodo}`)
          .join(", ") +
        (pendentes.length > 4 ? "…" : "") +
        ". Impede transferências voluntárias (LRF, art. 51, § 2º).",
      referenciaAutomatica: pendentes
        .map((e) => `${e.sigla}-${e.exercicio}-${e.periodicidade}${e.periodo}`)
        .sort()
        .join(","),
      registro,
      registrar: linkNovoAlerta(registro),
    });
  }

  for (const id of ["educacao", "fundeb", "saude"] as const) {
    const aplicacao = s.execucao?.[id];
    const alerta = aplicacao ? alertaMinimo(id, aplicacao, s, entidade) : null;
    if (alerta) alertas.push({ ...alerta, registrar: linkNovoAlerta(alerta.registro!) });
  }

  const rp = s.resultadoPrimario;
  if (rp?.final && rp.meta != null && rp.valor < rp.meta) {
    const registro: RegistroAlerta = {
      titulo: `Meta de resultado primário não atingida (${rp.referencia})`,
      descricao:
        `Segundo o ${rp.referencia} publicado no SICONFI (RREO, Anexo 6), o resultado primário do exercício foi de ${moeda(rp.valor)}, ` +
        `abaixo da meta de ${moeda(rp.meta)} fixada no Anexo de Metas Fiscais da LDO. A LRF (art. 9º) exige limitação de empenho ` +
        `quando a receita não comporta o cumprimento das metas; avaliar as causas e as medidas adotadas.`,
      probabilidade: 4,
      impacto: 3,
    };
    alertas.push({
      id: "resultado-primario",
      nivel: "ALERTA",
      rotuloNivel: "Meta não atingida",
      titulo: `Resultado primário de ${moeda(rp.valor)} abaixo da meta de ${moeda(rp.meta)}`,
      detalhe: "Apurado no último bimestre do exercício (LRF, art. 9º).",
      referencia: rp.referencia,
      doEnte: true,
      referenciaAutomatica: rp.referencia,
      registro,
      registrar: linkNovoAlerta(registro),
    });
  }

  return alertas.sort((a, b) => PESO_NIVEL[a.nivel] - PESO_NIVEL[b.nivel]);
}
