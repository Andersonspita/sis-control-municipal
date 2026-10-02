"use client";

import { useTransition } from "react";
import { Building2, Check, ChevronsUpDown, Landmark } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { selecionarCliente } from "@/app/actions/sessao";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import type { TipoCliente } from "@/generated/prisma/browser";

type Opcao = { id: string; nome: string; tipo: TipoCliente; municipio: string; uf: string };

export function TrocaCliente({ atual, opcoes }: { atual: Opcao; opcoes: Opcao[] }) {
  const [pendente, iniciar] = useTransition();
  const IconeAtual = atual.tipo === "CAMARA" ? Landmark : Building2;

  function trocar(id: string) {
    if (id === atual.id) return;
    const fd = new FormData();
    fd.set("clienteId", id);
    iniciar(() => selecionarCliente(fd));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={opcoes.length < 2 || pendente}
        className="flex min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-left outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:hover:bg-transparent"
        aria-label={`Entidade atual: ${atual.nome}. Trocar entidade`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <IconeAtual aria-hidden="true" className="size-4.5" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{atual.nome}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {TIPO_CLIENTE[atual.tipo]} · {atual.municipio}/{atual.uf}
          </span>
        </span>
        {opcoes.length > 1 && <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Trocar entidade</DropdownMenuLabel>
          {opcoes.map((o) => (
            <DropdownMenuItem key={o.id} onClick={() => trocar(o.id)} className="items-start gap-2 py-2">
              <Check aria-hidden="true" className={o.id === atual.id ? "mt-0.5 opacity-100" : "mt-0.5 opacity-0"} />
              <span>
                <span className="block font-medium">{o.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {TIPO_CLIENTE[o.tipo]} · {o.municipio}/{o.uf}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
