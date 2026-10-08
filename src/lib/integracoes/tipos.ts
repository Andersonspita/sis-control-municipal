// Formato do campo `dados` de coletas_integracao, por fonte. Gravado pela sincronização e lido pelas telas.

export type DadosIbge = {
  codigoIbge: string;
  municipio: string;
  uf: string;
  microrregiao: string | null;
  regiaoImediata: string | null;
  populacao: number | null;
  /** Ano de referência da população. */
  anoPopulacao: string | null;
  tipoPopulacao: "ESTIMATIVA" | "CENSO" | null;
};

/** E = Executivo (Prefeitura), L = Legislativo (Câmara). */
export type Poder = "E" | "L";

export type FaixaLimite = "REGULAR" | "ALERTA" | "PRUDENCIAL" | "EXCEDIDO";

export type SituacaoEntrega = "ENTREGUE" | "PENDENTE" | "A_VENCER";

export type EntregaSiconfi = {
  /** Nome do entregável no SICONFI (ex.: "Relatório de Gestão Fiscal"). */
  entregavel: string;
  sigla: "RREO" | "RGF" | "DCA" | "MSC";
  exercicio: number;
  periodo: number;
  /** B (bimestral), Q (quadrimestral), S (semestral), M (mensal), A (anual). */
  periodicidade: string;
  /** Rótulo do período (ex.: "2º quadrimestre/2026"). */
  rotuloPeriodo: string;
  /** Data limite (AAAA-MM-DD). */
  prazo: string;
  entregueEm: string | null;
  situacao: SituacaoEntrega;
};

export type DadosSiconfi = {
  exercicio: number;
  poder: Poder;
  /** Instituição cujos dados foram lidos (ex.: "Prefeitura Municipal de Abaíra - BA"). */
  instituicao: string | null;
  rcl: { valor: number; ajustadaPessoal: number | null; referencia: string } | null;
  pessoal: {
    valor: number;
    /** % da despesa total com pessoal sobre a RCL ajustada. */
    percentual: number;
    faixa: FaixaLimite;
    referencia: string;
  } | null;
  /** Do ente, lido no RGF Anexo 02 do Executivo (também exibido para a Câmara). */
  divida: {
    consolidada: number | null;
    consolidadaLiquida: number | null;
    /** % da DCL sobre a RCL (limite de 120% para municípios, Res. Senado 40/2001). */
    percentualDcl: number | null;
    referencia: string;
  } | null;
  /** Do ente, lido no RREO Anexo 06 do Executivo (também exibido para a Câmara). */
  resultadoPrimario: { valor: number; meta: number | null; criterio: "SEM_RPPS" | "COM_RPPS"; referencia: string } | null;
  entregas: EntregaSiconfi[];
  avisos: string[];
};

export type RecursoPorOrgao = { orgao: string; valor: number };

export type ConvenioResumo = {
  numero: string;
  objeto: string;
  orgao: string;
  situacao: string;
  convenente: string;
  doCliente: boolean;
  inicioVigencia: string | null;
  fimVigencia: string | null;
  valor: number;
  valorLiberado: number;
};

export type DadosPortalTransparencia = {
  ano: number;
  mesInicio: number;
  mesFim: number;
  recursos: {
    total: number;
    registros: number;
    /** Nome e município do favorecido conforme o Portal — revela CNPJ cadastrado errado. */
    favorecido?: { nome: string; municipio: string | null } | null;
    porOrgao: RecursoPorOrgao[];
    porMes: { anoMes: number; valor: number }[];
    truncado: boolean;
  };
  convenios: {
    encontrados: number;
    vigentes: number;
    valorVigentes: number;
    liberadoVigentes: number;
    lista: ConvenioResumo[];
    truncado: boolean;
  };
};

export type SancaoResumo = {
  cadastro: "CEIS" | "CNEP";
  sancionado: string;
  tipo: string;
  orgao: string;
  inicio: string | null;
  fim: string | null;
  processo: string | null;
  multa: string | null;
};
