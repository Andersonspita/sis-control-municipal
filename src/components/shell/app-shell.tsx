import { listarVinculos, type Contexto } from "@/lib/auth/dal";
import { Marca } from "@/components/marca";
import { PERFIL } from "@/lib/rotulos";
import { obterTema } from "@/lib/temas";
import { MenuMovel, NavFaixas, NavLateral, NavTopoGrupos, NavTopoItens, NavTrilho } from "./navegacao";
import { TrocaCliente } from "./troca-cliente";
import { MenuUsuario } from "./menu-usuario";

function PularParaConteudo() {
  return (
    <a
      href="#conteudo"
      className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Ir para o conteúdo
    </a>
  );
}

export async function AppShell({
  ctx,
  variante,
  children,
}: {
  ctx: Contexto;
  variante: "controle" | "satelite";
  children: React.ReactNode;
}) {
  const vinculos = await listarVinculos(ctx.usuarioId);
  const opcoes = vinculos.map((v) => v.cliente);
  const cargo = vinculos.find((v) => v.cliente.id === ctx.clienteId)?.cargo;
  const { navegacao } = obterTema(ctx.cliente.tema);

  const usuario = (tom: "claro" | "escuro") => (
    <MenuUsuario
      nome={ctx.usuario.nome}
      email={ctx.usuario.email}
      papel={cargo ?? PERFIL[ctx.perfil]}
      tom={tom}
      linkAparencia={variante === "controle"}
    />
  );
  const conteudo = (
    <main id="conteudo" className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
      {children}
    </main>
  );

  if (navegacao === "topo" || navegacao === "faixas") {
    return (
      <div className="flex min-h-screen flex-col">
        <PularParaConteudo />
        <header className="sticky top-0 z-30 shadow-sm">
          <div className="flex h-14 items-center gap-4 bg-sidebar px-3 text-sidebar-foreground sm:px-5">
            <MenuMovel variante={variante} className="text-sidebar-foreground hover:bg-sidebar-accent lg:hidden" />
            <Marca compacta className="lg:hidden" />
            <Marca className="hidden shrink-0 lg:inline-flex" />
            {navegacao === "topo" && (
              <nav aria-label="Grupos do menu" className="hidden h-full lg:block">
                <NavTopoGrupos variante={variante} />
              </nav>
            )}
            <div className="ml-auto flex min-w-0 items-center gap-2">
              <div className="hidden min-w-0 md:block">
                <TrocaCliente atual={ctx.cliente} opcoes={opcoes} tom="escuro" />
              </div>
              {usuario("escuro")}
            </div>
          </div>
          <div className="hidden border-b bg-card px-3 sm:px-5 lg:block">
            {navegacao === "topo" ? (
              <nav aria-label="Menu do grupo">
                <NavTopoItens variante={variante} />
              </nav>
            ) : (
              <NavFaixas variante={variante} />
            )}
          </div>
          <div className="border-b bg-card px-3 py-1.5 md:hidden">
            <TrocaCliente atual={ctx.cliente} opcoes={opcoes} />
          </div>
        </header>
        {conteudo}
      </div>
    );
  }

  const cabecalho = (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-2 border-b bg-card/95 px-3 backdrop-blur sm:gap-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-1">
        <MenuMovel variante={variante} className="lg:hidden" />
        <TrocaCliente atual={ctx.cliente} opcoes={opcoes} />
      </div>
      {usuario("claro")}
    </header>
  );

  if (navegacao === "trilho") {
    return (
      <div className="flex min-h-screen">
        <PularParaConteudo />
        <aside className="sticky top-0 hidden h-screen shrink-0 lg:flex lg:flex-col">
          <div className="flex h-16 w-[4.5rem] shrink-0 items-center justify-center bg-sidebar">
            <Marca compacta />
          </div>
          <div className="min-h-0 flex-1">
            <NavTrilho variante={variante} />
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {cabecalho}
          {conteudo}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <PularParaConteudo />
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-5 py-5">
          <Marca />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavLateral variante={variante} />
        </div>
        <p className="border-t border-sidebar-border px-5 py-3 text-[0.7rem] text-sidebar-foreground/60">HorizonAJ</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {cabecalho}
        {conteudo}
      </div>
    </div>
  );
}

export function CabecalhoPagina({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="max-w-2xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex items-center gap-2">{acoes}</div>}
    </div>
  );
}
