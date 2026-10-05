import Link from "next/link";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { exigirUsuario, obterContexto } from "@/lib/auth/dal";
import { sair } from "@/app/actions/sessao";
import { AppShell } from "@/components/shell/app-shell";
import { Marca } from "@/components/marca";
import { Button } from "@/components/ui/button";

/** Disponível a todos os perfis: usa o layout do perfil do cliente ativo; o administrador sem cliente usa o visual da administração. */
export default async function LayoutConfiguracoes({ children }: LayoutProps<"/configuracoes">) {
  const sessao = await exigirUsuario();
  const ctx = await obterContexto();
  if (ctx) {
    return (
      <AppShell ctx={ctx} variante={ctx.perfil === "SATELITE" ? "satelite" : "controle"}>
        {children}
      </AppShell>
    );
  }
  if (!sessao.usuario.adminHorizon) redirect("/selecionar-cliente");

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-4">
          <div className="flex flex-wrap items-center gap-6">
            <Marca />
            <Link
              href="/admin"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              Voltar à administração
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-sidebar-foreground/80 sm:inline">{sessao.usuario.nome}</span>
            <form action={sair}>
              <Button
                type="submit"
                variant="ghost"
                className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <LogOut aria-hidden="true" /> Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-6xl px-6 py-10">
        {children}
      </main>
    </div>
  );
}
