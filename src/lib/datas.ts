// Campos @db.Date chegam como meia-noite UTC; formatar no fuso local mostraria o dia anterior.

export function formatarDataSimples(d: Date) {
  const [ano, mes, dia] = d.toISOString().slice(0, 10).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Dias entre hoje (no fuso de Brasília) e uma data simples. Negativo = no passado. */
export function diasAte(d: Date) {
  const hojeBr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date());
  const alvo = d.toISOString().slice(0, 10);
  return Math.round((Date.parse(alvo) - Date.parse(hojeBr)) / 86_400_000);
}

/** Meia-noite UTC de hoje no fuso de Brasília, para comparar com campos @db.Date. */
export function hojeComoDataSimples() {
  return new Date(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" }).format(new Date()));
}
