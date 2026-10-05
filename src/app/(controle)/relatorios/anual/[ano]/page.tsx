import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { carregarRelatorioAnual } from "@/lib/relatorios/anual";
import { anoValido } from "@/lib/relatorios/anual-secoes";
import { PDF_RELATORIO } from "@/lib/relatorios/urls";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { FormRelatorioAnual } from "./form-relatorio-anual";

export const metadata: Metadata = { title: "Relatório Anual de Controle Interno" };

export default async function RelatorioAnual(props: PageProps<"/relatorios/anual/[ano]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const ano = Number((await props.params).ano);
  if (!anoValido(ano)) notFound();
  const relatorio = await carregarRelatorioAnual({ ...ctx, usuarioNome: ctx.usuario.nome }, ano);
  const autor = relatorio?.atualizadoPorId
    ? await db.usuario.findUnique({ where: { id: relatorio.atualizadoPorId }, select: { nome: true } })
    : null;

  return (
    <>
      <Link href="/relatorios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Relatórios
      </Link>
      <CabecalhoPagina
        titulo={`Relatório Anual de Controle Interno — ${ano}`}
        descricao="Art. 17 da Res. TCM-BA 1.120/2005. Autoavaliação, auditorias, medidas, demandas e planos de ação do exercício entram automaticamente no PDF; aqui ficam os textos da controladoria."
        acoes={
          <a href={PDF_RELATORIO.anual(ano)} target="_blank" rel="noopener" className={buttonVariants({ size: "lg" })}>
            <FileDown aria-hidden="true" />
            Gerar PDF
          </a>
        }
      />
      <Card>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {relatorio
              ? `Última alteração em ${formatarDataHora(relatorio.atualizadoEm)}${autor ? ` por ${autor.nome}` : ""}.`
              : "Textos ainda não preenchidos para este exercício."}
            {relatorio?.emitidoEm ? ` Último PDF emitido em ${formatarDataHora(relatorio.emitidoEm)}.` : ""} Salve antes de gerar o PDF.
          </p>
          <FormRelatorioAnual ano={ano} iniciais={relatorio?.secoes ?? {}} />
        </CardContent>
      </Card>
    </>
  );
}
