import type { Metadata } from "next";
import Link from "next/link";
import { Building2, LogOut } from "lucide-react";
import { exigirAdmin } from "@/lib/admin";
import { sair } from "@/app/actions/sessao";
import { Marca } from "@/components/marca";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NavAdmin } from "./nav-admin";

export const metadata: Metadata = { title: { template: "%s · Administração HorizonAJ", default: "Administração HorizonAJ" } };

const estiloCabecalho = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export default async function LayoutAdmin({ children }: LayoutProps<"/admin">) {
  const sessao = await exigirAdmin();

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <Marca />
            <NavAdmin />
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-sidebar-foreground/80 sm:inline">{sessao.usuario.nome}</span>
            <Link href="/selecionar-cliente" className={cn(buttonVariants({ variant: "ghost" }), estiloCabecalho)}>
              <Building2 aria-hidden="true" /> Entrar em uma entidade
            </Link>
            <form action={sair}>
              <Button type="submit" variant="ghost" className={estiloCabecalho}>
                <LogOut aria-hidden="true" /> Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl space-y-6 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
