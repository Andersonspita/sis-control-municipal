"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/admin", rotulo: "Clientes" },
  { href: "/admin/usuarios", rotulo: "Usuários" },
  { href: "/admin/trilha", rotulo: "Trilha global" },
  { href: "/admin/ia", rotulo: "Inteligência artificial" },
  { href: "/configuracoes", rotulo: "Minha conta" },
];

export function NavAdmin() {
  const caminho = usePathname();
  return (
    <nav aria-label="Administração" className="flex gap-1">
      {ITENS.map((item) => {
        const ativo = item.href === "/admin" ? caminho === "/admin" : caminho.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              ativo && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            {item.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
