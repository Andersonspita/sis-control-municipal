import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Building2, Landmark } from "lucide-react";
import { obterSessao } from "@/lib/auth/dal";
import { listarOrgaosMunicipio, resolverMunicipioAcesso } from "@/lib/auth/municipio";
import { brasaoComoDataUri } from "@/lib/pdf/brasao";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { obterTema } from "@/lib/temas";
import { Marca } from "@/components/marca";
import { FormLogin } from "@/app/login/form-login";

export async function generateMetadata({ params }: PageProps<"/m/[slug]">): Promise<Metadata> {
  const municipio = await resolverMunicipioAcesso((await params).slug);
  return { title: municipio ? `Entrar · ${municipio.nome}/${municipio.uf}` : "Entrar" };
}

export default async function PaginaLoginMunicipio({ params }: PageProps<"/m/[slug]">) {
  const municipio = await resolverMunicipioAcesso((await params).slug);
  if (!municipio) notFound();
  if (await obterSessao()) redirect("/");

  const orgaos = await listarOrgaosMunicipio(municipio.id);
  // Identidade visual da Prefeitura (tema escolhido em Aparência e brasão), se houver.
  const principal = orgaos.find((o) => o.tipo === "PREFEITURA") ?? orgaos[0];
  const tema = obterTema(principal?.tema);
  const brasao = await brasaoComoDataUri(orgaos.find((o) => o.brasaoKey)?.brasaoKey);
  const local = `${municipio.nome}/${municipio.uf}`;

  return (
    <div data-tema={tema.id} className="grid min-h-screen bg-background font-sans text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <section className="relative hidden overflow-hidden bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <Marca />
        <div className="relative z-10 max-w-lg space-y-6">
          <div className="flex items-center gap-4">
            {brasao && (
              // eslint-disable-next-line @next/next/no-img-element -- data URI do armazenamento interno
              <img src={brasao} alt={`Brasão de ${municipio.nome}`} className="size-16 shrink-0 object-contain" />
            )}
            <div>
              <p className="text-sm uppercase tracking-[0.14em] opacity-75">Município de</p>
              <p className="font-heading text-3xl font-semibold leading-tight">{local}</p>
            </div>
          </div>
          {orgaos.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm opacity-80">Entidades atendidas neste acesso:</p>
              <ul className="space-y-1.5">
                {orgaos.map((o) => {
                  const Icone = o.tipo === "CAMARA" ? Landmark : Building2;
                  return (
                    <li key={o.id} className="flex items-center gap-2 text-sm">
                      <Icone aria-hidden="true" className="size-4 shrink-0 text-sidebar-primary" />
                      <span>{o.nome}</span>
                      <span className="opacity-60">· {TIPO_CLIENTE[o.tipo]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
        <p className="text-xs opacity-60">HorizonAJ</p>
        <div className="pointer-events-none absolute -right-24 -bottom-24 size-96 rounded-full border-[3rem] border-sidebar-primary/10" />
      </section>

      <main id="conteudo" className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm space-y-8">
          <div className="space-y-2">
            <Marca className="text-primary lg:hidden" />
            <p className="text-sm font-medium text-primary">{local}</p>
            <h1 className="text-2xl font-semibold">Entrar</h1>
            <p className="text-sm text-muted-foreground">
              Acesso das entidades de {municipio.nome}. Use o e-mail e a senha cadastrados pela sua controladoria.
            </p>
            {orgaos.length > 0 && (
              <p className="text-xs text-muted-foreground lg:hidden">{orgaos.map((o) => o.nome).join(" · ")}</p>
            )}
          </div>
          <FormLogin municipio={municipio.slug} />
        </div>
      </main>
    </div>
  );
}
