import {
  BookOpenCheck,
  Briefcase,
  ClipboardCheck,
  FileSearch,
  FileText,
  FolderCog,
  FolderOpen,
  History,
  Inbox,
  Landmark,
  LayoutDashboard,
  ListChecks,
  Network,
  Palette,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  ShieldUser,
  Siren,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type ItemMenu = { href: string; rotulo: string; icone: LucideIcon; emBreve?: boolean; somenteAdmin?: boolean };
export type GrupoMenu = { id: string; titulo: string; icone: LucideIcon; itens: ItemMenu[] };
export type VarianteMenu = "controle" | "satelite";

export const MENUS: Record<VarianteMenu, GrupoMenu[]> = {
  controle: [
    {
      id: "painel",
      titulo: "Painel",
      icone: LayoutDashboard,
      itens: [
        { href: "/painel", rotulo: "Painel", icone: LayoutDashboard },
        { href: "/dados-externos", rotulo: "Dados externos", icone: Landmark },
      ],
    },
    {
      id: "conformidade",
      titulo: "Conformidade",
      icone: ShieldCheck,
      itens: [
        { href: "/normas", rotulo: "Normas", icone: BookOpenCheck },
        { href: "/autoavaliacao", rotulo: "Autoavaliação", icone: ClipboardCheck },
        { href: "/planos", rotulo: "Planos de ação", icone: ListChecks },
        { href: "/ia", rotulo: "Sugestões da IA", icone: Sparkles },
      ],
    },
    {
      id: "atuacao",
      titulo: "Atuação",
      icone: Briefcase,
      itens: [
        { href: "/demandas", rotulo: "Demandas", icone: Send },
        { href: "/auditorias", rotulo: "Auditorias", icone: FileSearch },
        { href: "/alertas", rotulo: "Alertas", icone: Siren },
      ],
    },
    {
      id: "gestao",
      titulo: "Gestão",
      icone: FolderCog,
      itens: [
        { href: "/documentos", rotulo: "Documentos", icone: FolderOpen },
        { href: "/relatorios", rotulo: "Relatórios", icone: FileText },
        { href: "/unidades", rotulo: "Unidades", icone: Network },
        { href: "/trilha", rotulo: "Trilha de auditoria", icone: History },
        { href: "/aparencia", rotulo: "Aparência", icone: Palette },
        { href: "/configuracoes", rotulo: "Configurações", icone: Settings },
        { href: "/admin", rotulo: "Administração", icone: ShieldUser, somenteAdmin: true },
      ],
    },
  ],
  satelite: [
    {
      id: "unidade",
      titulo: "Minha unidade",
      icone: Inbox,
      itens: [
        { href: "/satelite", rotulo: "Minhas demandas", icone: Inbox },
        { href: "/satelite/painel", rotulo: "Painel da unidade", icone: ScrollText },
      ],
    },
  ],
};

export function menusPara(variante: VarianteMenu, admin = false): GrupoMenu[] {
  if (admin) return MENUS[variante];
  return MENUS[variante]
    .map((grupo) => ({ ...grupo, itens: grupo.itens.filter((i) => !i.somenteAdmin) }))
    .filter((grupo) => grupo.itens.length > 0);
}

/** Item ativo = o de href mais longo que casa com o caminho atual. */
export function localizarAtivo(grupos: GrupoMenu[], caminho: string) {
  let ativoHref: string | undefined;
  let grupoAtivo: GrupoMenu | undefined;
  for (const grupo of grupos) {
    for (const item of grupo.itens) {
      const casa = caminho === item.href || caminho.startsWith(`${item.href}/`);
      if (casa && (!ativoHref || item.href.length > ativoHref.length)) {
        ativoHref = item.href;
        grupoAtivo = grupo;
      }
    }
  }
  return { ativoHref, grupoAtivo };
}

export function primeiroDisponivel(grupo: GrupoMenu) {
  return grupo.itens.find((i) => !i.emBreve);
}
