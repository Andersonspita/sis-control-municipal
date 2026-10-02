"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenCheck,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderOpen,
  History,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Network,
  ScrollText,
  Send,
  Siren,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ItemMenu = { href: string; rotulo: string; icone: LucideIcon; emBreve?: boolean };
type GrupoMenu = { titulo?: string; itens: ItemMenu[] };

const MENUS: Record<"controle" | "satelite", GrupoMenu[]> = {
  controle: [
    { itens: [{ href: "/painel", rotulo: "Painel", icone: LayoutDashboard }] },
    {
      titulo: "Conformidade",
      itens: [
        { href: "/normas", rotulo: "Normas", icone: BookOpenCheck },
        { href: "/autoavaliacao", rotulo: "Autoavaliação", icone: ClipboardCheck, emBreve: true },
        { href: "/planos", rotulo: "Planos de ação", icone: ListChecks, emBreve: true },
      ],
    },
    {
      titulo: "Atuação",
      itens: [
        { href: "/demandas", rotulo: "Demandas", icone: Send, emBreve: true },
        { href: "/auditorias", rotulo: "Auditorias", icone: FileSearch, emBreve: true },
        { href: "/medidas", rotulo: "Medidas", icone: Siren, emBreve: true },
      ],
    },
    {
      titulo: "Gestão",
      itens: [
        { href: "/documentos", rotulo: "Documentos", icone: FolderOpen, emBreve: true },
        { href: "/relatorios", rotulo: "Relatórios", icone: FileText, emBreve: true },
        { href: "/unidades", rotulo: "Unidades", icone: Network },
        { href: "/trilha", rotulo: "Trilha de auditoria", icone: History },
      ],
    },
  ],
  satelite: [
    {
      itens: [
        { href: "/satelite", rotulo: "Minhas demandas", icone: Inbox },
        { href: "/satelite/painel", rotulo: "Painel da unidade", icone: ScrollText, emBreve: true },
      ],
    },
  ],
};

export function MenuLateral({ variante }: { variante: keyof typeof MENUS }) {
  const caminho = usePathname();
  const grupos = MENUS[variante];
  const hrefs = grupos.flatMap((g) => g.itens.map((i) => i.href));
  // Item ativo = o de href mais longo que casa com o caminho atual.
  const ativoHref = hrefs
    .filter((h) => caminho === h || caminho.startsWith(`${h}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-6">
      {grupos.map((grupo, i) => (
        <div key={grupo.titulo ?? i} className="space-y-1">
          {grupo.titulo && (
            <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/55">
              {grupo.titulo}
            </p>
          )}
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const ativo = item.href === ativoHref;
              const Icone = item.icone;
              if (item.emBreve) {
                return (
                  <li key={item.href}>
                    <span
                      aria-disabled="true"
                      className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/45"
                    >
                      <Icone aria-hidden="true" className="size-4" />
                      <span className="flex-1">{item.rotulo}</span>
                      <span className="rounded-full border border-sidebar-foreground/20 px-1.5 text-[0.62rem] uppercase tracking-wide">
                        em breve
                      </span>
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                      ativo
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icone aria-hidden="true" className="size-4" />
                    {item.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
