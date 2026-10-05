import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { listarModelos } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { TIPO_AUDITORIA } from "@/lib/rotulos";
import { criarModelosBaseDoCliente } from "./actions";
import { BotaoAcao } from "../botao-acao";
import { DialogoModelo } from "./dialogos";

export const metadata: Metadata = { title: "Modelos de checklist" };

export default async function ModelosChecklist() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const modelos = await listarModelos(ctx);

  return (
    <>
      <Link href="/auditorias" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft aria-hidden="true" className="size-4" /> Auditorias
      </Link>
      <CabecalhoPagina
        titulo="Modelos de checklist"
        descricao="Roteiros reutilizáveis de verificação. Ao aplicar um modelo a uma auditoria, os itens são copiados para a execução."
        acoes={
          <div className="flex flex-wrap gap-2">
            <BotaoAcao acao={criarModelosBaseDoCliente} variant="outline" size="lg">
              <Sparkles aria-hidden="true" /> Criar modelos-base
            </BotaoAcao>
            <DialogoModelo />
          </div>
        }
      />
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Modelos de checklist do cliente</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Modelo</th>
                <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Tipo</th>
                <th scope="col" className="px-3 py-3 font-medium">Itens</th>
                <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Aplicações</th>
                <th scope="col" className="px-5 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {modelos.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link href={`/auditorias/modelos/${m.id}`} className="font-medium underline-offset-4 hover:underline">
                      {m.nome}
                    </Link>
                    {m.descricao && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{m.descricao}</p>}
                  </td>
                  <td className="hidden px-3 py-3 md:table-cell">{m.tipo ? TIPO_AUDITORIA[m.tipo] : "Qualquer"}</td>
                  <td className="px-3 py-3 tabular-nums">{m._count.itens}</td>
                  <td className="hidden px-3 py-3 tabular-nums md:table-cell">{m._count.aplicacoes}</td>
                  <td className="px-5 py-3">{m.ativo ? "Ativo" : <span className="text-muted-foreground">Inativo</span>}</td>
                </tr>
              ))}
              {modelos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
                    Nenhum modelo. Use “Criar modelos-base” (licitação, contrato e folha) ou crie um novo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
