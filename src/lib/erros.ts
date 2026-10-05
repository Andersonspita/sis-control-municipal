/** Erro de regra de negócio cuja mensagem pode ser exibida ao usuário. */
export class ErroNegocio extends Error {}

/** Erro de validação de arquivo cuja mensagem pode ser exibida ao usuário. */
export class ErroArquivo extends ErroNegocio {}

export function mensagemDeErro(err: unknown, padrao = "Não foi possível concluir a operação. Tente novamente.") {
  if (err instanceof ErroNegocio) return err.message;
  console.error(err);
  return padrao;
}
