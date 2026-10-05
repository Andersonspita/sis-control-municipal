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

/** Data simples (meia-noite UTC) somada de `dias`. */
export function somarDias(d: Date, dias: number) {
  return new Date(d.getTime() + dias * 86_400_000);
}

/** "AAAA-MM-DD" para campos <input type="date">. */
export function paraCampoData(d: Date) {
  return d.toISOString().slice(0, 10);
}

const formatoDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Bahia",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Data e hora de um timestamp, no fuso de Brasília. */
export function formatarDataHora(d: Date) {
  return formatoDataHora.format(d).replace(",", " às");
}
