import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Power, Trash2 } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { carregarModelo } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TIPO_AUDITORIA } from "@/lib/rotulos";
import { alternarModeloAtivo, excluirItemModelo } from "../actions";
import { BotaoAcao } from "../../botao-acao";
import { DialogoItemModelo, DialogoModelo } from "../dialogos";

export const metadata: Metadata = { title: "Modelo de checklist" };

export default async function DetalheModelo({ params }: PageProps<"/auditorias/modelos/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const modelo = await carregarModelo(ctx, (await params).id);
  if (!modelo) notFound();

  return (
    <>
      <Link href="/auditorias/modelos" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Modelos de checklist
      </Link>
      <CabecalhoPagina
        titulo={modelo.nome}
        descricao={[
          modelo.tipo ? TIPO_AUDITORIA[modelo.tipo] : "Qualquer tipo",
          `${modelo.itens.length} item(ns)`,
          `aplicado em ${modelo._count.aplicacoes} auditoria(s)`,
          modelo.ativo ? "ativo" : "inativo",
        ].join(" · ")}
        acoes={
          <div className="flex flex-wrap gap-2">
            <DialogoModelo modelo={modelo} />
            <BotaoAcao acao={alternarModeloAtivo.bind(null, modelo.id)} variant="outline" size="lg">
              <Power aria-hidden="true" /> {modelo.ativo ? "Desativar" : "Ativar"}
            </BotaoAcao>
          </div>
        }
      />
      {modelo.descricao && <p className="mb-6 max-w-3xl text-sm text-muted-foreground">{modelo.descricao}</p>}
      <Card className="max-w-4xl">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Itens</CardTitle>
          <DialogoItemModelo modeloId={modelo.id} />
        </CardHeader>
        <CardContent>
          {modelo.itens.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum item. Modelos sem itens não podem ser aplicados.</p>
          ) : (
            <ol className="space-y-3">
              {modelo.itens.map((i, pos) => (
                <li key={i.id} className="flex items-start justify-between gap-3 border-b pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">
                      {pos + 1}. {i.texto}
                    </p>
                    {i.orientacao && <p className="text-xs text-muted-foreground">{i.orientacao}</p>}
                  </div>
                  <div className="flex shrink-0 items-center">
                    <DialogoItemModelo modeloId={modelo.id} item={i} />
                    <BotaoAcao acao={excluirItemModelo.bind(null, modelo.id, i.id)} confirmar="Excluir este item do modelo?" variant="ghost" size="icon-sm" rotulo="Excluir item">
                      <Trash2 aria-hidden="true" />
                    </BotaoAcao>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </>
  );
}
