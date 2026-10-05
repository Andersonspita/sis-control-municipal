import type { Prisma, TipoAuditoria } from "@/generated/prisma/client";

type ModeloBase = { nome: string; descricao: string; tipo: TipoAuditoria; itens: [texto: string, orientacao?: string][] };

/** Modelos de checklist oferecidos a todo cliente (seed e botão “Criar modelos-base”). */
export const MODELOS_BASE: ModeloBase[] = [
  {
    nome: "Licitação — pregão",
    descricao: "Verificação da fase interna e externa de pregão (Lei 14.133/2021).",
    tipo: "CONFORMIDADE",
    itens: [
      ["Há documento de formalização da demanda e estudo técnico preliminar?", "Art. 18, I, da Lei 14.133/2021."],
      ["O termo de referência define objeto, quantidades e critérios de aceitação?"],
      ["A pesquisa de preços segue os parâmetros do art. 23 (no mínimo três fontes)?"],
      ["Há parecer jurídico sobre o edital e a minuta de contrato?", "Art. 53 da Lei 14.133/2021."],
      ["O edital foi publicado no PNCP e no sítio oficial com antecedência mínima legal?"],
      ["O agente de contratação/pregoeiro foi formalmente designado?"],
      ["A habilitação do vencedor foi conferida (regularidade fiscal, trabalhista e qualificação)?"],
      ["Recursos e impugnações foram respondidos e publicados?"],
      ["A homologação e a adjudicação foram feitas pela autoridade competente?"],
    ],
  },
  {
    nome: "Contrato — execução",
    descricao: "Acompanhamento da execução contratual, fiscalização e pagamentos.",
    tipo: "CONFORMIDADE",
    itens: [
      ["O contrato foi publicado no PNCP dentro do prazo legal?", "Art. 94 da Lei 14.133/2021."],
      ["Há gestor e fiscal do contrato formalmente designados?"],
      ["A garantia contratual exigida foi prestada e está vigente?"],
      ["Existem registros de fiscalização (relatórios, diário, ocorrências)?"],
      ["As notas fiscais foram atestadas pelo fiscal antes do pagamento?"],
      ["A liquidação da despesa precede o pagamento e confere com o empenho?", "Arts. 62 e 63 da Lei 4.320/1964."],
      ["A regularidade fiscal e trabalhista da contratada é verificada a cada pagamento?"],
      ["Aditivos e apostilamentos estão justificados e dentro dos limites legais?"],
      ["A ordem cronológica de pagamentos é respeitada?"],
    ],
  },
  {
    nome: "Folha de pagamento",
    descricao: "Conferência da folha, de vantagens e dos limites de despesa com pessoal.",
    tipo: "FINANCEIRA",
    itens: [
      ["Os servidores da folha têm ato de nomeação/admissão válido?"],
      ["Há conferência de acumulação ilegal de cargos?", "Art. 37, XVI, da Constituição."],
      ["As vantagens pagas têm amparo em lei e ato concessório?"],
      ["O teto remuneratório é observado?", "Art. 37, XI, da Constituição."],
      ["Os descontos previdenciários e de IRRF são recolhidos corretamente?"],
      ["A despesa com pessoal está dentro dos limites da LRF?", "Arts. 19 e 20 da LC 101/2000."],
      ["Contratações temporárias têm amparo legal e processo seletivo?"],
      ["Há controle de frequência que respalda a folha?"],
    ],
  },
];

/** Cria os modelos-base que ainda não existem no cliente; devolve quantos foram criados. */
export async function criarModelosBase(tx: Prisma.TransactionClient, clienteId: string) {
  const existentes = new Set(
    (await tx.modeloChecklist.findMany({ where: { clienteId }, select: { nome: true } })).map((m) => m.nome),
  );
  let criados = 0;
  for (const m of MODELOS_BASE.filter((m) => !existentes.has(m.nome))) {
    await tx.modeloChecklist.create({
      data: {
        clienteId,
        nome: m.nome,
        descricao: m.descricao,
        tipo: m.tipo,
        itens: { create: m.itens.map(([texto, orientacao], i) => ({ clienteId, ordem: i + 1, texto, orientacao })) },
      },
    });
    criados++;
  }
  return criados;
}
