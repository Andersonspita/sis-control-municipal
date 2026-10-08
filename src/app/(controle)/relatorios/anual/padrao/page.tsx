import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { carregarModeloAnual } from "@/lib/relatorios/anual";
import { TEXTO_BASE_ANUAL, textoPadraoCompleto } from "@/lib/relatorios/anual-padrao";
import { anoAtual } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { FormRelatorioAnual } from "../[ano]/form-relatorio-anual";
import { SeletorExercicio } from "../seletor-exercicio";

export const metadata: Metadata = { title: "Texto padrão do Relatório Anual" };

export default async function TextoPadraoAnual() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const modelo = await carregarModeloAnual({ ...ctx, usuarioNome: ctx.usuario.nome });
  const autor = modelo?.atualizadoPorId
    ? await db.usuario.findUnique({ where: { id: modelo.atualizadoPorId }, select: { nome: true } })
    : null;

  return (
    <>
      <Link href="/relatorios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Relatórios
      </Link>
      <CabecalhoPagina
        titulo="Texto padrão do Relatório Anual"
        descricao="Vale para todos os exercícios. Para alterar o texto de um ano específico, selecione o exercício: só as seções alteradas lá deixam de seguir este padrão."
        acoes={<SeletorExercicio anoInicial={anoAtual()} />}
      />
      <Card>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {modelo
              ? `Última alteração em ${formatarDataHora(modelo.atualizadoEm)}${autor ? ` por ${autor.nome}` : ""}.`
              : "O texto-base do sistema já vem preenchido; ajuste-o à realidade da entidade e salve."}
          </p>
          <FormRelatorioAnual modo="padrao" iniciais={textoPadraoCompleto(modelo?.secoes ?? {})} referencia={TEXTO_BASE_ANUAL} />
        </CardContent>
      </Card>
    </>
  );
}
