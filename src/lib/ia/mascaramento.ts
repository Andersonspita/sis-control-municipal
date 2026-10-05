// Mascaramento de dados pessoais (LGPD) antes de qualquer envio à OpenAI. Função pura.
// Prefere mascarar a mais: um número de 11 dígitos solto vira [CPF] mesmo que seja telefone.

export type TipoDadoPessoal = "email" | "nascimento" | "cpf" | "rg" | "cns" | "telefone" | "nome";

export const MARCADORES: Record<TipoDadoPessoal, string> = {
  email: "[E-MAIL]",
  nascimento: "[DATA DE NASCIMENTO]",
  cpf: "[CPF]",
  rg: "[RG]",
  cns: "[CNS]",
  telefone: "[TELEFONE]",
  nome: "[NOME]",
};

/** Padrão sem distinção de maiúsculas só para o rótulo (o nome que vem depois precisa começar com maiúscula). */
function semCaixa(s: string) {
  return s.replace(/\p{L}/gu, (c) => {
    const [mi, ma] = [c.toLowerCase(), c.toUpperCase()];
    return mi === ma ? c : `[${mi}${ma}]`;
  });
}

const N = String.raw`(?:n[º°o.]*\s*)?`;
const SEP = String.raw`\s*[:\-–]?\s*`;
const PALAVRA_NOME = String.raw`[A-ZÀ-ÖØ-Þ][A-Za-zÀ-ÖØ-öø-ÿ'’\-]+`;
const CONECTOR = String.raw`(?:[dD][aeoAEO][sS]?|[eE])`;
const NOME = String.raw`${PALAVRA_NOME}(?:[ \t]+(?:${CONECTOR}[ \t]+)?${PALAVRA_NOME})*`;

const ROTULOS_NOME = [
  "nome completo",
  "nome social",
  "nome do paciente",
  "nome da paciente",
  "nome da mãe",
  "nome da mae",
  "nome do pai",
  "nome",
  "paciente",
  "requerente",
  "interessado",
  "interessada",
  "beneficiário",
  "beneficiária",
  "beneficiario",
  "beneficiaria",
  "servidor",
  "servidora",
  "denunciante",
  "denunciado",
  "denunciada",
  "usuário",
  "usuária",
  "aluno",
  "aluna",
  "mãe",
  "mae",
  "pai",
  "responsável",
  "responsavel",
  "acompanhante",
  "titular",
]
  .map(semCaixa)
  .join("|");

type Regra = { tipo: TipoDadoPessoal; re: RegExp; manterRotulo?: boolean };

// A ordem importa: rótulos explícitos primeiro, padrões soltos depois, nomes por último.
const REGRAS: Regra[] = [
  { tipo: "email", re: /[\p{L}\d._%+\-]+@[\p{L}\d\-]+(?:\.[\p{L}\d\-]+)+/gu },
  {
    tipo: "nascimento",
    manterRotulo: true,
    re: new RegExp(
      String.raw`(\b(?:${semCaixa("data de nascimento")}|${semCaixa("nascimento")}|${semCaixa("nascid")}[oa]\s+${semCaixa("em")}|[dD]\.[nN]\.|DN(?=\s*:))${SEP})(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4})`,
      "gu",
    ),
  },
  { tipo: "cpf", manterRotulo: true, re: new RegExp(String.raw`(\bCPF(?:\/MF)?\s*${N}${SEP})\d[\d.\-\s]{9,13}\d`, "giu") },
  {
    tipo: "rg",
    manterRotulo: true,
    re: new RegExp(
      String.raw`(\b(?:RG|R\.G\.|${semCaixa("registro geral")}|${semCaixa("cédula de identidade")}|${semCaixa("cedula de identidade")}|${semCaixa("carteira de identidade")}|${semCaixa("identidade")})\s*${N}${SEP})[\dXx][\dXx.\-\/ ]{3,16}[\dXx]`,
      "gu",
    ),
  },
  {
    tipo: "cns",
    manterRotulo: true,
    re: new RegExp(
      String.raw`(\b(?:CNS|${semCaixa("cartão sus")}|${semCaixa("cartao sus")}|${semCaixa("cartão nacional de saúde")}|${semCaixa("cartao nacional de saude")})\s*${N}${SEP})\d[\d.\s]{13,19}\d`,
      "gu",
    ),
  },
  { tipo: "cns", re: /\b[1-9]\d{2}[ .]?\d{4}[ .]?\d{4}[ .]?\d{4}\b/g },
  {
    tipo: "telefone",
    manterRotulo: true,
    re: new RegExp(
      String.raw`(\b(?:${semCaixa("telefone")}|${semCaixa("tel")}\.?|${semCaixa("fone")}|${semCaixa("celular")}|${semCaixa("whatsapp")})\s*${SEP})\+?[\d()][\d()+\-. \t]{6,18}\d`,
      "gu",
    ),
  },
  { tipo: "telefone", re: /(?:\+55[ \t]?)?\(\d{2}\)[ \t]?9?\d{4}[-. \t]?\d{4}/g },
  { tipo: "telefone", re: /(?:\+55[ \t]?)?\b\d{2}[ \t]9\d{4}[-. \t]?\d{4}\b/g },
  { tipo: "telefone", re: /\b9\d{4}-\d{4}\b/g },
  { tipo: "cpf", re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g },
  { tipo: "cpf", re: /\b\d{11}\b/g },
  { tipo: "rg", re: /\b\d{1,2}\.\d{3}\.\d{3}-[\dXx]\b/g },
  { tipo: "nome", manterRotulo: true, re: new RegExp(String.raw`(\b(?:${ROTULOS_NOME})[ \t]*:[ \t]*)${NOME}`, "gu") },
];

export type ResultadoMascaramento = { texto: string; contagem: Partial<Record<TipoDadoPessoal, number>> };

export function mascararDadosPessoais(texto: string): ResultadoMascaramento {
  const contagem: Partial<Record<TipoDadoPessoal, number>> = {};
  let saida = texto;
  for (const { tipo, re, manterRotulo } of REGRAS) {
    saida = saida.replace(re, (...args: unknown[]) => {
      contagem[tipo] = (contagem[tipo] ?? 0) + 1;
      const rotulo = manterRotulo && typeof args[1] === "string" ? args[1] : "";
      return rotulo + MARCADORES[tipo];
    });
  }
  return { texto: saida, contagem };
}

export function somarContagens(contagens: Partial<Record<TipoDadoPessoal, number>>[]) {
  const total: Partial<Record<TipoDadoPessoal, number>> = {};
  for (const c of contagens) {
    for (const [tipo, n] of Object.entries(c) as [TipoDadoPessoal, number][]) total[tipo] = (total[tipo] ?? 0) + n;
  }
  return total;
}
