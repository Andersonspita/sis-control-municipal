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
  LayoutDashboard,
  ListChecks,
  Network,
  Palette,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  Siren,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type ItemMenu = { href: string; rotulo: string; icone: LucideIcon; emBreve?: boolean };
export type GrupoMenu = { id: string; titulo: string; icone: LucideIcon; itens: ItemMenu[] };
export type VarianteMenu = "controle" | "satelite";

export const MENUS: Record<VarianteMenu, GrupoMenu[]> = {
  controle: [
    {
      id: "painel",
      titulo: "Painel",
      icone: LayoutDashboard,
      itens: [{ href: "/painel", rotulo: "Painel", icone: LayoutDashboard }],
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
        { href: "/medidas", rotulo: "Medidas", icone: Siren },
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
