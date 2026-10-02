import type { Metadata } from "next";
import { Building2, ChevronRight, Landmark, LogOut } from "lucide-react";
import { exigirUsuario, listarVinculos } from "@/lib/auth/dal";
import { selecionarCliente, sair } from "@/app/actions/sessao";
import { Marca } from "@/components/marca";
import { Button } from "@/components/ui/button";
import { PERFIL, TIPO_CLIENTE } from "@/lib/rotulos";

export const metadata: Metadata = { title: "Selecionar cliente" };

export default async function SelecionarCliente() {
  const sessao = await exigirUsuario();
  const vinculos = await listarVinculos(sessao.usuario.id);

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Marca />
          <form action={sair}>
            <Button type="submit" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <LogOut aria-hidden="true" /> Sair
            </Button>
          </form>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Olá, {sessao.usuario.nome.split(" ")[0]}</h1>
          <p className="text-muted-foreground">Escolha a entidade em que deseja trabalhar.</p>
        </div>

        {vinculos.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Seu usuário ainda não está vinculado a nenhuma entidade. Procure a controladoria responsável.
          </p>
        ) : (
          <ul className="space-y-3">
            {vinculos.map((v) => {
              const Icone = v.cliente.tipo === "CAMARA" ? Landmark : Building2;
              return (
                <li key={v.id}>
                  <form action={selecionarCliente}>
                    <input type="hidden" name="clienteId" value={v.cliente.id} />
                    <button
                      type="submit"
                      className="group flex w-full items-center gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icone aria-hidden="true" className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{v.cliente.nome}</span>
                        <span className="block text-sm text-muted-foreground">
                          {TIPO_CLIENTE[v.cliente.tipo]} · {v.cliente.municipio}/{v.cliente.uf} · {v.cargo ?? PERFIL[v.perfil]}
                        </span>
                      </span>
                      <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
