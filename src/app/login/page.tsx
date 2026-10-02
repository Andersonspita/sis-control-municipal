import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { obterSessao } from "@/lib/auth/dal";
import { Marca } from "@/components/marca";
import { FormLogin } from "./form-login";

export const metadata: Metadata = { title: "Entrar" };

export default async function PaginaLogin({ searchParams }: PageProps<"/login">) {
  if (await obterSessao()) redirect("/");
  const { voltar } = await searchParams;

  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <section
        aria-hidden="true"
        className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12"
      >
        <Marca />
        <div className="max-w-lg space-y-4">
          <p className="font-heading text-3xl font-semibold leading-tight">
            Controle interno organizado, rastreável e alinhado às normas do TCM-BA e da Rede de Controle.
          </p>
          <p className="text-sm opacity-80">
            Autoavaliação da OT 05 e da Resolução 1.120/2005, planos de ação, demandas às secretarias e trilha de
            auditoria em um só lugar.
          </p>
        </div>
        <p className="text-xs opacity-60">HorizonAJ</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border-[3rem] border-sidebar-primary/10" />
      </section>

      <main id="conteudo" className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <Marca className="text-primary lg:hidden" />
            <h1 className="text-2xl font-semibold">Entrar</h1>
            <p className="text-sm text-muted-foreground">Use o e-mail e a senha cadastrados pela sua controladoria.</p>
          </div>
          <FormLogin voltar={typeof voltar === "string" ? voltar : undefined} />
        </div>
      </main>
    </div>
  );
}
