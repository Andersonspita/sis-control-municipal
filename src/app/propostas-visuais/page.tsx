import type { Metadata } from "next";
import { IBM_Plex_Sans, Source_Sans_3, Source_Serif_4 } from "next/font/google";
import Link from "next/link";
import { AlarmClock, ArrowRight, BookOpenCheck, ClipboardCheck, Inbox, LayoutDashboard, ListChecks, Send } from "lucide-react";
import { Marca } from "@/components/marca";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { atkinson, atkinsonMono } from "./fontes";
import { SeloAmeixa, Situacao } from "./ameixa/kit";

export const metadata: Metadata = { title: "Propostas de identidade visual" };

const plex = IBM_Plex_Sans({ variable: "--font-ibm-plex", subsets: ["latin"], weight: ["400", "500", "600"] });
const sourceSans = Source_Sans_3({ variable: "--font-source-sans", subsets: ["latin"] });
const sourceSerif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"] });

const PROPOSTAS = [
  {
    tema: "institucional",
    nome: "1 · Institucional",
    resumo:
      "Azul-marinho com detalhes em dourado e tipografia Public Sans, criada para serviços públicos. Transmite formalidade e confiança, próxima da linguagem visual de tribunais e órgãos de controle.",
  },
  {
    tema: "petroleo",
    nome: "2 · Verde-petróleo",
    resumo:
      "Visual claro e arejado, menu lateral branco, cantos mais arredondados e tipografia IBM Plex Sans. Mais leve para uso prolongado e com aparência de produto moderno.",
  },
  {
    tema: "grafite",
    nome: "3 · Grafite e âmbar",
    resumo:
      "Grafite com destaque âmbar, títulos em serifa (Source Serif) e cantos retos. Sóbria e de alto contraste, lembra documentos oficiais e relatórios de auditoria.",
  },
  {
    tema: "ameixa",
    nome: "4 · Ameixa e ciano",
    resumo:
      "Ameixa profundo com detalhes em ciano e tipografia Atkinson Hyperlegible, feita para máxima legibilidade. Navegação no topo em dois níveis, que libera toda a largura da tela para tabelas e textos normativos.",
  },
] as const;

function MiniAppTopo() {
  return (
    <div className="flex h-[30rem] flex-col overflow-hidden rounded-(--radius) border bg-background text-foreground shadow-sm">
      <div className="flex h-11 shrink-0 items-center gap-4 bg-sidebar px-4 text-sidebar-foreground">
        <span className="flex items-center gap-2">
          <SeloAmeixa className="size-6 text-destaque" />
          <span className="text-[0.8rem] font-bold text-white">Controladoria Municipal</span>
        </span>
        {["Painel", "Conformidade", "Atuação", "Gestão"].map((g, i) => (
          <span key={g} className={cn("relative py-3 text-[0.75rem] font-semibold", i === 0 ? "text-white after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-full after:bg-sidebar-primary" : "opacity-80")}>
            {g}
          </span>
        ))}
        <span className="ml-auto rounded-md border border-sidebar-border px-2 py-0.5 text-[0.68rem]">Prefeitura Municipal de Exemplo</span>
      </div>
      <div className="min-w-0 flex-1 space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Painel</h3>
            <p className="text-xs text-muted-foreground">Prefeitura Municipal de Exemplo</p>
          </div>
          <Button size="sm">Nova demanda</Button>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            { r: "Demandas em aberto", v: 12, i: Inbox, c: "bg-secondary text-primary" },
            { r: "Vencidas", v: 3, i: AlarmClock, c: "bg-perigo/10 text-perigo" },
            { r: "Ações atrasadas", v: 5, i: ListChecks, c: "bg-perigo/10 text-perigo" },
          ].map((k) => (
            <div key={k.r} className="flex items-start justify-between rounded-(--radius) border bg-card p-3">
              <div>
                <p className="text-[0.7rem] font-semibold text-muted-foreground">{k.r}</p>
                <p className="font-(family-name:--fonte-codigo) text-2xl font-bold">{k.v}</p>
              </div>
              <span className={cn("flex size-8 items-center justify-center rounded-md", k.c)}>
                <k.i aria-hidden="true" className="size-4" />
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-(--radius) border bg-card p-3">
          <p className="text-sm font-bold">Aderência às normas</p>
          {[
            { n: "OT 05 — Rede de Controle", p: 62 },
            { n: "Resolução TCM-BA 1.120/2005", p: 41 },
          ].map((x) => (
            <div key={x.n} className="space-y-1">
              <div className="flex justify-between text-[0.75rem]">
                <span>{x.n}</span>
                <span className="font-(family-name:--fonte-codigo) font-bold text-primary">{x.p}%</span>
              </div>
              <Progress value={x.p} aria-label={x.n} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Situacao s="atende" />
          <Situacao s="emAnalise" />
          <Situacao s="naoAtende" />
          <Situacao s="naoSeAplica" />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">Cancelar</Button>
          <Button size="sm" variant="secondary">Salvar rascunho</Button>
        </div>
      </div>
    </div>
  );
}

function MiniApp() {
  const menu = [
    { rotulo: "Painel", icone: LayoutDashboard, ativo: true },
    { rotulo: "Normas", icone: BookOpenCheck },
    { rotulo: "Autoavaliação", icone: ClipboardCheck },
    { rotulo: "Planos de ação", icone: ListChecks },
    { rotulo: "Demandas", icone: Send },
  ];
  return (
    <div className="flex h-[30rem] overflow-hidden rounded-(--radius) border bg-background text-foreground shadow-sm">
      <aside className="flex w-48 shrink-0 flex-col gap-5 bg-sidebar p-4 text-sidebar-foreground">
        <Marca className="scale-90 origin-left" />
        <ul className="space-y-0.5">
          {menu.map((m) => (
            <li
              key={m.rotulo}
              className={cn(
                "relative flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[0.8rem]",
                m.ativo
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary"
                  : "text-sidebar-foreground/80",
              )}
            >
              <m.icone aria-hidden="true" className="size-3.5" />
              {m.rotulo}
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-w-0 flex-1 space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Painel</h3>
            <p className="text-xs text-muted-foreground">Prefeitura Municipal de Exemplo</p>
          </div>
          <Button size="sm">Nova demanda</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[
            { r: "Demandas em aberto", v: 12, i: Inbox, c: "bg-primary/10 text-primary" },
            { r: "Vencidas", v: 3, i: AlarmClock, c: "bg-perigo/12 text-perigo" },
          ].map((k) => (
            <div key={k.r} className="flex items-start justify-between rounded-(--radius) border bg-card p-3">
              <div>
                <p className="text-[0.7rem] text-muted-foreground">{k.r}</p>
                <p className="font-heading text-2xl font-semibold">{k.v}</p>
              </div>
              <span className={cn("flex size-8 items-center justify-center rounded-md", k.c)}>
                <k.i aria-hidden="true" className="size-4" />
              </span>
            </div>
          ))}
        </div>
        <div className="space-y-3 rounded-(--radius) border bg-card p-3">
          <p className="font-heading text-sm font-semibold">Aderência às normas</p>
          {[
            { n: "OT 05 — Rede de Controle", p: 62 },
            { n: "Resolução TCM-BA 1.120/2005", p: 41 },
          ].map((x) => (
            <div key={x.n} className="space-y-1">
              <div className="flex justify-between text-[0.75rem]">
                <span>{x.n}</span>
                <span className="text-muted-foreground">{x.p}%</span>
              </div>
              <Progress value={x.p} aria-label={x.n} />
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>Atendido</Badge>
          <Badge variant="secondary">Em análise</Badge>
          <Badge variant="destructive">Não atendido</Badge>
          <Badge variant="outline">Não se aplica</Badge>
          <span className="rounded-full bg-destaque px-2 py-0.5 text-xs font-medium text-destaque-foreground">Destaque</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">Cancelar</Button>
          <Button size="sm" variant="secondary">Salvar rascunho</Button>
        </div>
      </div>
    </div>
  );
}

export default function PropostasVisuais() {
  return (
    <main
      id="conteudo"
      className={cn(
        plex.variable,
        sourceSans.variable,
        sourceSerif.variable,
        atkinson.variable,
        atkinsonMono.variable,
        "mx-auto max-w-7xl space-y-10 px-6 py-10",
      )}
    >
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Propostas de identidade visual</h1>
        <p className="max-w-3xl text-muted-foreground">
          Quatro direções para o Sistema de Controladoria Municipal. A mesma tela aparece em cada proposta; a escolhida
          será aplicada a todo o sistema. Todas atendem ao contraste mínimo de acessibilidade (WCAG 2.1 AA / eMAG).
        </p>
      </div>
      {PROPOSTAS.map((p) => (
        <section key={p.tema} data-tema={p.tema} className="grid gap-6 font-sans lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold">{p.nome}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">{p.resumo}</p>
            <div className="flex gap-1.5" aria-hidden="true">
              {["bg-primary", "bg-sidebar", "bg-destaque", "bg-sucesso", "bg-alerta", "bg-perigo"].map((c) => (
                <span key={c} className={cn("size-7 rounded-full border", c)} />
              ))}
            </div>
            {p.tema === "ameixa" && (
              <Link href="/propostas-visuais/ameixa" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline underline-offset-2">
                Ver as 7 telas, componentes e tokens <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </div>
          {p.tema === "ameixa" ? <MiniAppTopo /> : <MiniApp />}
        </section>
      ))}
    </main>
  );
}
