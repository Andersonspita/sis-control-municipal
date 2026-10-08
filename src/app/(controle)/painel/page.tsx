import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, ClipboardCheck, Gauge, History, Inbox, ListChecks, Network, Siren, TriangleAlert } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { resumoPainel } from "@/lib/dados/painel";
import { carregarDadosExternos } from "@/lib/dados/integracoes";
import { calcularAlertasFiscais } from "@/lib/integracoes/alertas-fiscais";
import { BLOCOS_PAINEL, blocosVisiveis, type IdBlocoPainel } from "@/lib/painel/blocos";
import { preferenciasDaPagina } from "@/lib/preferencias";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { AlternarTodos, BlocoRecolhivel, ProvedorRecolhiveis } from "@/components/recolhivel";
import { ListaAlertasFiscais } from "@/components/alertas/alertas-fiscais";
import { cn } from "@/lib/utils";
import {
  ConteudoAderencia,
  ConteudoAlertas,
  ConteudoDemandas,
  ConteudoIndices,
  ConteudoMovimentacoes,
  ConteudoPlanos,
  ConteudoTransferencias,
  ConteudoUnidades,
} from "./blocos";
import { DialogoPersonalizarPainel } from "./dialogo-personalizar";

export const metadata: Metadata = { title: "Painel" };

const ICONES: Record<IdBlocoPainel, React.ReactNode> = {
  indices: <Gauge />,
  "alertas-fiscais": <TriangleAlert />,
  alertas: <Siren />,
  demandas: <Inbox />,
  aderencia: <ClipboardCheck />,
  movimentacoes: <History />,
  planos: <ListChecks />,
  transferencias: <ArrowLeftRight />,
  unidades: <Network />,
};

/** Blocos que ocupam a largura inteira; os demais dividem a linha em duas colunas. */
const LARGURA_TOTAL: ReadonlySet<IdBlocoPainel> = new Set(["indices", "demandas", "planos"]);

export default async function Painel() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const pref = await preferenciasDaPagina(ctx.usuarioId, "painel");
  const visiveis = blocosVisiveis(pref.ocultos);
  const precisaExternos = visiveis.some((id) => id === "indices" || id === "alertas-fiscais" || id === "transferencias");
  const [r, d] = await Promise.all([resumoPainel(ctx), precisaExternos ? carregarDadosExternos(ctx) : null]);

  const alertasFiscais = d
    ? calcularAlertasFiscais({
        entidade: d.cliente.nome,
        codigoIbge: d.cliente.codigoIbge,
        siconfi: d.siconfi,
      })
    : [];
  const resumos: Partial<Record<IdBlocoPainel, string>> = {
    "alertas-fiscais": alertasFiscais.length ? `${alertasFiscais.length} alerta(s)` : "nenhum alerta",
    alertas: `${r.alertas.emAberto} em aberto`,
    demandas: `${r.demandasAbertas} em aberto, ${r.demandasVencidas} vencida(s)`,
    planos: `${r.acoes.abertas} ações abertas, ${r.acoes.vencidas} vencida(s)`,
    unidades: `${r.unidades} unidades`,
  };

  const conteudo = (id: IdBlocoPainel) => {
    switch (id) {
      case "indices":
        return d && <ConteudoIndices r={r} d={d} />;
      case "alertas-fiscais":
        return <ListaAlertasFiscais alertas={alertasFiscais} />;
      case "alertas":
        return <ConteudoAlertas r={r} />;
      case "demandas":
        return <ConteudoDemandas r={r} />;
      case "aderencia":
        return <ConteudoAderencia r={r} tipo={ctx.cliente.tipo} />;
      case "movimentacoes":
        return <ConteudoMovimentacoes r={r} />;
      case "planos":
        return <ConteudoPlanos r={r} />;
      case "transferencias":
        return d && <ConteudoTransferencias d={d} />;
      case "unidades":
        return <ConteudoUnidades r={r} />;
    }
  };

  const ocultos = BLOCOS_PAINEL.filter((b) => !visiveis.includes(b.id));

  return (
    <ProvedorRecolhiveis pagina="painel" iniciais={pref.recolhidos}>
      <CabecalhoPagina
        titulo="Painel"
        descricao={`Visão geral do controle interno — ${ctx.cliente.nome} (${TIPO_CLIENTE[ctx.cliente.tipo]}).`}
        acoes={
          <>
            <AlternarTodos ids={visiveis} />
            <DialogoPersonalizarPainel visiveis={visiveis} />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        {visiveis.map((id) => {
          const b = BLOCOS_PAINEL.find((x) => x.id === id)!;
          return (
            <BlocoRecolhivel
              key={id}
              id={id}
              titulo={b.titulo}
              descricao={b.descricao}
              icone={ICONES[id]}
              resumo={resumos[id]}
              className={cn(LARGURA_TOTAL.has(id) && "xl:col-span-2")}
            >
              {conteudo(id)}
            </BlocoRecolhivel>
          );
        })}
      </div>

      {ocultos.length > 0 && (
        <p className="mt-6 text-sm text-muted-foreground">
          Fora do painel:{" "}
          {ocultos.map((b, i) => (
            <span key={b.id}>
              {i > 0 && " · "}
              <Link href={b.pagina.href} className="underline-offset-4 hover:text-foreground hover:underline">
                {b.titulo}
              </Link>
            </span>
          ))}
          . Use “Personalizar painel” para exibi-los aqui.
        </p>
      )}
    </ProvedorRecolhiveis>
  );
}
