"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ACCEPT_ARQUIVOS,
  DESCRICAO_TIPOS,
  LIMITE_ARQUIVO_BYTES,
  LIMITE_ARQUIVOS_POR_ENVIO,
  formatarTamanho,
  tipoDoArquivo,
  validarConjunto,
} from "@/lib/arquivos";
import { IconeArquivo } from "./icone-arquivo";

function mesmoArquivo(a: File, b: File) {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

/** Campo de anexos acessível: acumula seleções, valida tipo e tamanho e permite remover itens antes do envio. */
export function CampoAnexos({
  name = "anexos",
  rotulo = "Anexos",
  obrigatorio = false,
  disabled = false,
}: {
  name?: string;
  rotulo?: string;
  obrigatorio?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;
    const limpar = () => {
      setArquivos([]);
      setErro(null);
    };
    form.addEventListener("reset", limpar);
    return () => form.removeEventListener("reset", limpar);
  }, []);

  function aplicar(lista: File[]) {
    const dt = new DataTransfer();
    lista.forEach((f) => dt.items.add(f));
    if (inputRef.current) inputRef.current.files = dt.files;
    setArquivos(lista);
  }

  function aoSelecionar(e: React.ChangeEvent<HTMLInputElement>) {
    const novos = Array.from(e.target.files ?? []).filter((n) => !arquivos.some((a) => mesmoArquivo(a, n)));
    const combinados = [...arquivos, ...novos];
    const mensagem = validarConjunto(combinados);
    if (mensagem) {
      setErro(mensagem);
      aplicar(arquivos);
      return;
    }
    setErro(null);
    aplicar(combinados);
  }

  function remover(indice: number) {
    setErro(null);
    aplicar(arquivos.filter((_, i) => i !== indice));
    inputRef.current?.focus();
  }

  const idDica = `${id}-dica`;
  const idErro = `${id}-erro`;

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
        {obrigatorio && <span aria-hidden="true"> *</span>}
      </label>
      <div className="relative rounded-lg border border-dashed border-input bg-muted/30 px-3 py-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-sm font-medium">
            <Paperclip aria-hidden="true" className="size-4" />
            Selecionar arquivos
          </span>
          <span id={idDica} className="text-xs text-muted-foreground">
            {DESCRICAO_TIPOS}. Até {LIMITE_ARQUIVOS_POR_ENVIO} arquivos, {formatarTamanho(LIMITE_ARQUIVO_BYTES)} cada.
          </span>
        </div>
        <input
          ref={inputRef}
          id={id}
          name={name}
          type="file"
          multiple
          accept={ACCEPT_ARQUIVOS}
          required={obrigatorio && arquivos.length === 0}
          disabled={disabled}
          onChange={aoSelecionar}
          aria-describedby={erro ? `${idDica} ${idErro}` : idDica}
          aria-invalid={erro ? true : undefined}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        />
      </div>
      <p id={idErro} role="alert" className="text-sm text-destructive empty:hidden">
        {erro}
      </p>
      {arquivos.length > 0 && (
        <ul aria-label="Arquivos selecionados" className="divide-y rounded-lg border">
          {arquivos.map((a, i) => (
            <li key={`${a.name}-${a.lastModified}-${a.size}`} className="flex items-center gap-2 px-3 py-2 text-sm">
              <IconeArquivo categoria={tipoDoArquivo(a.name)?.categoria ?? "documento"} />
              <span className="min-w-0 flex-1 truncate">{a.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatarTamanho(a.size)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => remover(i)}
                aria-label={`Remover ${a.name}`}
                disabled={disabled}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
