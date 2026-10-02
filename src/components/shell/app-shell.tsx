import { listarVinculos, type Contexto } from "@/lib/auth/dal";
import { Marca } from "@/components/marca";
import { PERFIL } from "@/lib/rotulos";
import { MenuLateral } from "./menu-lateral";
import { TrocaCliente } from "./troca-cliente";
import { MenuUsuario } from "./menu-usuario";

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

  return (
    <div className="flex min-h-screen">
      <a
        href="#conteudo"
        className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Ir para o conteúdo
      </a>

      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
        <div className="px-5 py-5">
          <Marca />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <MenuLateral variante={variante} />
        </div>
        <p className="border-t border-sidebar-border px-5 py-3 text-[0.7rem] text-sidebar-foreground/50">HorizonAJ</p>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <TrocaCliente atual={ctx.cliente} opcoes={opcoes} />
          <MenuUsuario nome={ctx.usuario.nome} email={ctx.usuario.email} papel={cargo ?? PERFIL[ctx.perfil]} />
        </header>
        <main id="conteudo" className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          {children}
        </main>
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
