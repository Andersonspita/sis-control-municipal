// Validação e máscara de CNPJ (numérico ou alfanumérico, IN RFB 2.229/2024) e CPF.

export function normalizarCnpj(valor: string) {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export function somenteDigitos(valor: string) {
  return valor.replace(/\D/g, "");
}

function dvCnpj(base: string) {
  const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

export function cnpjValido(valor: string) {
  const c = normalizarCnpj(valor);
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1{13}$/.test(c)) return false;
  const dv1 = dvCnpj(c.slice(0, 12));
  const dv2 = dvCnpj(c.slice(0, 12) + dv1);
  return c.endsWith(`${dv1}${dv2}`);
}

export function cpfValido(valor: string) {
  const c = somenteDigitos(valor);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    const soma = [...c.slice(0, n)].reduce((s, d, i) => s + Number(d) * (n + 1 - i), 0);
    return ((soma * 10) % 11) % 10;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}

/** Aplica a máscara progressivamente (serve para digitação e exibição). */
export function mascararCnpj(valor: string) {
  const c = normalizarCnpj(valor).slice(0, 14);
  return c
    .replace(/^(.{2})(.)/, "$1.$2")
    .replace(/^(.{2})\.(.{3})(.)/, "$1.$2.$3")
    .replace(/^(.{2})\.(.{3})\.(.{3})(.)/, "$1.$2.$3/$4")
    .replace(/^(.{2})\.(.{3})\.(.{3})\/(.{4})(.)/, "$1.$2.$3/$4-$5");
}

export function mascararCpf(valor: string) {
  const c = somenteDigitos(valor).slice(0, 11);
  return c
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3-$4");
}

export const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;
