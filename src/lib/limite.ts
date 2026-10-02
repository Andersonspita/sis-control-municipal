import "server-only";

// Limitador em memória por processo. Ao escalar para mais de uma instância, migrar para Redis.
const tentativas = new Map<string, { contador: number; expiraEm: number }>();

export function excedeuLimite(chave: string, maximo: number) {
  const agora = Date.now();
  const atual = tentativas.get(chave);
  if (!atual || atual.expiraEm < agora) return false;
  return atual.contador >= maximo;
}

export function registrarTentativa(chave: string, janelaMs: number) {
  const agora = Date.now();
  const atual = tentativas.get(chave);
  if (!atual || atual.expiraEm < agora) {
    tentativas.set(chave, { contador: 1, expiraEm: agora + janelaMs });
  } else {
    atual.contador += 1;
  }
}

export function limparTentativas(chave: string) {
  tentativas.delete(chave);
}
