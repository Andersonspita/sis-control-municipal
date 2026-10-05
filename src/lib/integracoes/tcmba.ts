// TCM-BA: não há API nem dados abertos dos municípios. As consultas públicas (despesas, pessoal) exigem
// reCAPTCHA e o quadro de contas usa códigos internos do Tribunal; por isso só oferecemos links diretos,
// com o código IBGE (que é o valor usado pelo TCM-BA na seleção do município) para conferência.

export type LinkTcm = { titulo: string; descricao: string; url: string };

export function linksTcmBa(cliente: { municipio: string; codigoIbge: string | null; tipo: string }): LinkTcm[] {
  const entidade = cliente.tipo === "CAMARA" ? "a Câmara" : "a Prefeitura";
  const municipio = cliente.codigoIbge ? `${cliente.municipio} (código ${cliente.codigoIbge})` : cliente.municipio;
  return [
    {
      titulo: "Consulta de despesas",
      descricao: `Empenhos, liquidações e pagamentos: selecione ${municipio} e ${entidade}.`,
      url: "https://www.tcm.ba.gov.br/controle-social/consulta-de-despesas/",
    },
    {
      titulo: "Pessoal",
      descricao: `Quadro de pessoal e remuneração informados ao TCM-BA pel${entidade} de ${cliente.municipio}.`,
      url: "https://www.tcm.ba.gov.br/controle-social/pessoal/",
    },
    {
      titulo: "Quadro geral de prestação de contas",
      descricao: "Decisões sobre as contas anuais por município e entidade (aprovadas, com ressalvas, rejeitadas).",
      url: "https://www.tcm.ba.gov.br/resumo/index.html",
    },
    {
      titulo: "Consulta processual",
      descricao: `Processos de ${cliente.municipio} no Tribunal (por município, entidade e assunto).`,
      url: "https://www.tcm.ba.gov.br/controle-social/consulta-processual/",
    },
    {
      titulo: "e-TCM — consulta pública",
      descricao: "Processos eletrônicos e prestações de contas enviadas pelo e-TCM.",
      url: "https://e.tcm.ba.gov.br/epp/ConsultaPublica/listView.seam",
    },
    {
      titulo: "IEGM",
      descricao: "Índice de Efetividade da Gestão Municipal e questionários.",
      url: "https://www.tcm.ba.gov.br/iegm-indice-de-efetividade-da-gestao-municipal/",
    },
  ];
}
