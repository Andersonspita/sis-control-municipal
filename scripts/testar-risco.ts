import { classificarRisco, combinacoesDoNivel, NIVEIS_RISCO, nivelPorPontuacao, pontuacaoRisco } from "../src/lib/risco";

// Regra pura de classificação de risco (probabilidade × impacto).
// Uso: npx tsx scripts/testar-risco.ts

let falhas = 0;
function conferir(descricao: string, condicao: boolean) {
  console.log(`${condicao ? "OK   " : "FALHA"} ${descricao}`);
  if (!condicao) falhas++;
}

conferir("5 × 5 = 25 é crítico", classificarRisco(5, 5) === "CRITICO");
conferir("3 × 5 = 15 é crítico (limite inferior)", classificarRisco(3, 5) === "CRITICO");
conferir("2 × 5 = 10 é alto (limite inferior)", classificarRisco(2, 5) === "ALTO");
conferir("4 × 3 = 12 é alto", classificarRisco(4, 3) === "ALTO");
conferir("2 × 3 = 6 é médio (limite inferior)", classificarRisco(2, 3) === "MEDIO");
conferir("3 × 3 = 9 é médio (limite superior)", classificarRisco(3, 3) === "MEDIO");
conferir("5 × 1 = 5 é baixo (limite superior)", classificarRisco(5, 1) === "BAIXO");
conferir("1 × 1 = 1 é baixo", classificarRisco(1, 1) === "BAIXO");
conferir("pontuação 14 é alto", nivelPorPontuacao(14) === "ALTO");

let rejeitou = 0;
for (const [p, i] of [
  [0, 3],
  [6, 1],
  [2.5, 2],
  [3, Number.NaN],
]) {
  try {
    pontuacaoRisco(p, i);
  } catch {
    rejeitou++;
  }
}
conferir("valores fora de 1 a 5 ou não inteiros são rejeitados", rejeitou === 4);

const total = NIVEIS_RISCO.reduce((s, n) => s + combinacoesDoNivel(n).length, 0);
conferir("as combinações dos níveis cobrem a matriz 5 × 5 sem sobreposição", total === 25);
conferir("matriz tem 6 combinações críticas", combinacoesDoNivel("CRITICO").length === 6);

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : "\nTodas as verificações passaram.");
process.exit(falhas ? 1 : 0);
