import type { Metadata } from "next";
import Link from "next/link";
import { Building2, ChevronRight, Globe, Landmark, LogOut, ShieldUser } from "lucide-react";
import { exigirUsuario, listarVinculos, temVinculosForaDoMunicipio } from "@/lib/auth/dal";
import { selecionarCliente, sair, verTodasEntidades } from "@/app/actions/sessao";
import { Marca } from "@/components/marca";
import { Button, buttonVariants } from "@/components/ui/button";
import { PERFIL, TIPO_CLIENTE } from "@/lib/rotulos";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Selecionar cliente" };

const estiloCabecalho = "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export default async function SelecionarCliente() {
  const sessao = await exigirUsuario();
  const vinculos = await listarVinculos(sessao.usuario.id);
  const admin = sessao.usuario.adminHorizon;
  const municipio = sessao.municipioAcesso;
  const outrosMunicipios = municipio ? await temVinculosForaDoMunicipio(sessao.usuario.id, municipio.id) : false;

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Marca />
          <div className="flex items-center gap-1">
            {admin && (
              <Link href="/admin" className={cn(buttonVariants({ variant: "ghost" }), estiloCabecalho)}>
                <ShieldUser aria-hidden="true" /> Administração
              </Link>
            )}
            <form action={sair}>
              <Button type="submit" variant="ghost" className={estiloCabecalho}>
                <LogOut aria-hidden="true" /> Sair
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="conteudo" className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Olá, {sessao.usuario.nome.split(" ")[0]}</h1>
          <p className="text-muted-foreground">
            {municipio
              ? `Escolha a entidade de ${municipio.nome}/${municipio.uf} em que deseja trabalhar.`
              : "Escolha a entidade em que deseja trabalhar."}
          </p>
        </div>

        {vinculos.length === 0 ? (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            {municipio
              ? `Seu usuário não está vinculado a nenhuma entidade de ${municipio.nome}/${municipio.uf}.`
              : "Seu usuário ainda não está vinculado a nenhuma entidade. Procure a controladoria responsável."}
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

        {outrosMunicipios && (
          <form action={verTodasEntidades} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Você também tem acesso a entidades de outros municípios.
              {!admin && " Para vê-las, entre novamente pelo acesso geral."}
            </p>
            <Button type="submit" variant="outline">
              <Globe aria-hidden="true" /> Ver todas as entidades
            </Button>
          </form>
        )}

        {admin && (
          <Link
            href="/admin"
            className="group flex w-full items-center gap-4 rounded-lg border border-dashed bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldUser aria-hidden="true" className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">Administração HorizonAJ</span>
              <span className="block text-sm text-muted-foreground">Clientes, usuários e IA</span>
            </span>
            <ChevronRight aria-hidden="true" className="size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        )}
      </main>
    </div>
  );
}
