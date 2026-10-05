"use client";

import Link from "next/link";
import { LogOut, Palette, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sair } from "@/app/actions/sessao";
import { cn } from "@/lib/utils";

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export function MenuUsuario({
  nome,
  email,
  papel,
  tom = "claro",
  linkAparencia = false,
}: {
  nome: string;
  email: string;
  papel: string;
  tom?: "claro" | "escuro";
  linkAparencia?: boolean;
}) {
  const escuro = tom === "escuro";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none",
          escuro
            ? "hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring"
            : "hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
        )}
        aria-label={`Menu do usuário ${nome}`}
      >
        <span className="hidden text-right sm:block">
          <span className="block text-sm font-medium leading-tight">{nome}</span>
          <span className={cn("block text-xs", escuro ? "text-sidebar-foreground/75" : "text-muted-foreground")}>{papel}</span>
        </span>
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-full text-sm font-semibold",
            escuro ? "bg-sidebar-primary text-sidebar-primary-foreground" : "bg-primary text-primary-foreground",
          )}
        >
          {iniciais(nome)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            <span className="block text-sm font-medium text-foreground">{nome}</span>
            <span className="block font-normal">{email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/configuracoes" />}>
          <Settings aria-hidden="true" /> Configurações
        </DropdownMenuItem>
        {linkAparencia && (
          <DropdownMenuItem render={<Link href="/aparencia" />}>
            <Palette aria-hidden="true" /> Aparência do sistema
          </DropdownMenuItem>
        )}
        <DropdownMenuItem variant="destructive" onClick={() => sair()}>
          <LogOut aria-hidden="true" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
