"use client";

import { useRef, useTransition, type FormEvent } from "react";
import { toast } from "sonner";
import type { EstadoAcao } from "@/lib/acoes";

type Opcoes = { sucesso?: string; aoConcluir?: () => void };

/**
 * Liga um formulário a uma server action com toast de sucesso/erro.
 * O aviso sai do próprio envio (e não de um efeito) porque a mudança de situação costuma
 * desmontar o formulário na nova renderização; o React também não limpa os campos quando há erro.
 */
export function useAcaoFormulario(
  acao: (estado: EstadoAcao, formData: FormData) => Promise<EstadoAcao>,
  opcoes: Opcoes = {},
) {
  const [pendente, iniciar] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const dados = new FormData(form);
    iniciar(async () => {
      const r = await acao(undefined, dados);
      if (r?.ok) {
        toast.success(r.mensagem ?? opcoes.sucesso ?? "Operação concluída.");
        form.reset();
        opcoes.aoConcluir?.();
      } else if (r?.erro) {
        toast.error(r.erro);
      }
    });
  }

  return { pendente, formRef, onSubmit };
}
