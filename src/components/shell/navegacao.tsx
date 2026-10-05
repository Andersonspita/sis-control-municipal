"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Marca } from "@/components/marca";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { localizarAtivo, menusPara, primeiroDisponivel, type ItemMenu, type VarianteMenu } from "./menus";

type PropsNav = { variante: VarianteMenu; admin?: boolean };

function useMenu(variante: VarianteMenu, admin?: boolean) {
  const caminho = usePathname();
  const grupos = menusPara(variante, admin);
  return { grupos, ...localizarAtivo(grupos, caminho) };
}

function EmBreve({ item, className }: { item: ItemMenu; className?: string }) {
  const Icone = item.icone;
  return (
    <span aria-disabled="true" title="Em breve" className={cn("flex items-center gap-2 opacity-55", className)}>
      <Icone aria-hidden="true" className="size-4 shrink-0" />
      <span className="truncate">{item.rotulo}</span>
      <span className="sr-only">(em breve)</span>
    </span>
  );
}

// ─── Menu lateral (temas 1–3) e conteúdo do menu móvel ───

export function NavLateral({ variante, admin, aoNavegar }: PropsNav & { aoNavegar?: () => void }) {
  const { grupos, ativoHref } = useMenu(variante, admin);
  const multiplosGrupos = grupos.length > 1;

  return (
    <nav aria-label="Menu principal" className="flex flex-col gap-6">
      {grupos.map((grupo) => (
        <div key={grupo.id} className="space-y-1">
          {multiplosGrupos && grupo.itens.length > 1 && (
            <p className="px-3 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/60">
              {grupo.titulo}
            </p>
          )}
          <ul className="space-y-0.5">
            {grupo.itens.map((item) => {
              const ativo = item.href === ativoHref;
              const Icone = item.icone;
              if (item.emBreve) {
                return (
                  <li key={item.href} className="flex items-center gap-2 pr-2">
                    <EmBreve item={item} className="flex-1 px-3 py-2 text-sm text-sidebar-foreground" />
                    <span className="rounded-full border border-sidebar-foreground/25 px-1.5 text-[0.62rem] uppercase tracking-wide text-sidebar-foreground/60">
                      em breve
                    </span>
                  </li>
                );
              }
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={aoNavegar}
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

export function MenuMovel({ variante, admin, className }: PropsNav & { className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger
        aria-label="Abrir menu"
        className={cn(
          "inline-flex size-10 shrink-0 items-center justify-center rounded-md outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Menu aria-hidden="true" className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
        <SheetTitle className="sr-only">Menu principal</SheetTitle>
        <div className="px-5 py-5">
          <Marca />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavLateral variante={variante} admin={admin} aoNavegar={() => setAberto(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Trilho de ícones + painel do grupo (tema 5) ───

export function NavTrilho({ variante, admin }: PropsNav) {
  const { grupos, ativoHref, grupoAtivo } = useMenu(variante, admin);
  const mostrarPainel = grupoAtivo && grupoAtivo.itens.length > 1;

  return (
    <nav aria-label="Menu principal" className="flex h-full">
      <ul className="flex w-[4.5rem] shrink-0 flex-col items-stretch gap-1 bg-sidebar px-1.5 pt-1 text-sidebar-foreground">
        {grupos.map((grupo) => {
          const destino = primeiroDisponivel(grupo);
          const ativo = grupo.id === grupoAtivo?.id;
          const Icone = grupo.icone;
          const conteudo = (
            <>
              <Icone aria-hidden="true" className="size-5" />
              <span className="text-[0.65rem] font-semibold leading-tight">{grupo.titulo}</span>
            </>
          );
          const base = "flex flex-col items-center gap-1 rounded-md px-1 py-2.5 text-center";
          return (
            <li key={grupo.id}>
              {destino ? (
                <Link
                  href={destino.href}
                  aria-current={ativo ? "true" : undefined}
                  className={cn(
                    base,
                    "relative outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                    ativo
                      ? "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-2 before:-left-1.5 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary"
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {conteudo}
                </Link>
              ) : (
                <span aria-disabled="true" title="Em breve" className={cn(base, "opacity-50")}>
                  {conteudo}
                  <span className="sr-only">(em breve)</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {mostrarPainel && (
        <div className="w-56 shrink-0 border-r bg-card">
          <p className="px-5 pt-5 pb-3 font-heading text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {grupoAtivo.titulo}
          </p>
          <ul className="space-y-0.5 px-2.5">
            {grupoAtivo.itens.map((item) => {
              const Icone = item.icone;
              if (item.emBreve) {
                return (
                  <li key={item.href}>
                    <EmBreve item={item} className="gap-2.5 px-2.5 py-2 text-sm text-muted-foreground" />
                  </li>
                );
              }
              const ativo = item.href === ativoHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "relative flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      ativo
                        ? "bg-accent font-semibold text-accent-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-destaque"
                        : "text-foreground/85 hover:bg-muted",
                    )}
                  >
                    <Icone aria-hidden="true" className="size-4 shrink-0" />
                    {item.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </nav>
  );
}

// ─── Topo em dois níveis (tema 4) ───

export function NavTopoGrupos({ variante, admin }: PropsNav) {
  const { grupos, grupoAtivo } = useMenu(variante, admin);
  return (
    <ul className="flex h-full items-stretch gap-1">
      {grupos.map((grupo) => {
        const destino = primeiroDisponivel(grupo);
        const ativo = grupo.id === grupoAtivo?.id;
        const base = "relative flex items-center px-3 text-sm font-semibold";
        return (
          <li key={grupo.id} className="flex">
            {destino ? (
              <Link
                href={destino.href}
                aria-current={ativo ? "true" : undefined}
                className={cn(
                  base,
                  "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-inset",
                  ativo
                    ? "text-sidebar-accent-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-sidebar-primary"
                    : "text-sidebar-foreground/80 hover:text-sidebar-accent-foreground",
                )}
              >
                {grupo.titulo}
              </Link>
            ) : (
              <span aria-disabled="true" title="Em breve" className={cn(base, "text-sidebar-foreground/50")}>
                {grupo.titulo}
                <span className="sr-only"> (em breve)</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function NavTopoItens({ variante, admin }: PropsNav) {
  const { grupoAtivo, ativoHref } = useMenu(variante, admin);
  if (!grupoAtivo) return null;
  return (
    <ul className="flex h-11 items-stretch gap-1 overflow-x-auto">
      {grupoAtivo.itens.map((item) => {
        const Icone = item.icone;
        if (item.emBreve) {
          return (
            <li key={item.href} className="flex">
              <EmBreve item={item} className="px-3 text-sm whitespace-nowrap text-muted-foreground" />
            </li>
          );
        }
        const ativo = item.href === ativoHref;
        return (
          <li key={item.href} className="flex">
            <Link
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2 px-3 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                ativo
                  ? "font-semibold text-primary after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-primary"
                  : "text-foreground/80 hover:text-foreground",
              )}
            >
              <Icone aria-hidden="true" className="size-4" />
              {item.rotulo}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Duas faixas com todos os grupos visíveis (tema 6) ───

export function NavFaixas({ variante, admin }: PropsNav) {
  const { grupos, ativoHref } = useMenu(variante, admin);
  return (
    <nav aria-label="Menu principal" className="flex items-stretch gap-0 overflow-x-auto">
      {grupos.map((grupo, i) => (
        <div key={grupo.id} className={cn("flex flex-col justify-center py-1.5", i > 0 && "border-l pl-3 ml-3")}>
          <p className="px-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {grupo.titulo}
          </p>
          <ul className="flex items-center gap-0.5">
            {grupo.itens.map((item) => {
              const Icone = item.icone;
              if (item.emBreve) {
                return (
                  <li key={item.href}>
                    <EmBreve item={item} className="px-2 py-1.5 text-sm whitespace-nowrap text-muted-foreground" />
                  </li>
                );
              }
              const ativo = item.href === ativoHref;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                      ativo ? "bg-destaque-fundo font-semibold text-destaque" : "text-foreground/85 hover:bg-muted",
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
