import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileDown, FileText } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { carregarModeloAnual, carregarRelatorioAnual } from "@/lib/relatorios/anual";
import { secoesEfetivas, textoPadraoCompleto } from "@/lib/relatorios/anual-padrao";
import { anoValido, SECOES_ANUAL, type ChaveSecaoAnual } from "@/lib/relatorios/anual-secoes";
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
  const ctxRel = { ...ctx, usuarioNome: ctx.usuario.nome };
  const [relatorio, modelo] = await Promise.all([carregarRelatorioAnual(ctxRel, ano), carregarModeloAnual(ctxRel)]);
  const padrao = textoPadraoCompleto(modelo?.secoes ?? {});
  const efetivas = secoesEfetivas(relatorio?.secoes ?? {}, modelo?.secoes ?? {});
  const atuais = Object.fromEntries(SECOES_ANUAL.map(({ chave }) => [chave, efetivas[chave].texto])) as Record<ChaveSecaoAnual, string>;
  const personalizadas = SECOES_ANUAL.filter(({ chave }) => efetivas[chave].origem === "ano").length;
  const autor = relatorio?.atualizadoPorId ? await db.usuario.findUnique({ where: { id: relatorio.atualizadoPorId }, select: { nome: true } }) : null;

  return (
    <>
      <Link href="/relatorios" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft aria-hidden="true" className="size-4" />
        Relatórios
      </Link>
      <CabecalhoPagina
        titulo={`Relatório Anual de Controle Interno — ${ano}`}
        descricao="Art. 17 da Res. TCM-BA 1.120/2005. Autoavaliação, auditorias, alertas, demandas e planos de ação do exercício entram automaticamente no PDF; aqui ficam os textos da controladoria."
        acoes={
          <>
            <Link href="/relatorios/anual/padrao" className={buttonVariants({ variant: "outline", size: "lg" })}>
              <FileText aria-hidden="true" />
              Texto padrão
            </Link>
            <a href={PDF_RELATORIO.anual(ano)} target="_blank" rel="noopener" className={buttonVariants({ size: "lg" })}>
              <FileDown aria-hidden="true" />
              Gerar PDF
            </a>
          </>
        }
      />
      <Card>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {relatorio
              ? `Última alteração em ${formatarDataHora(relatorio.atualizadoEm)}${autor ? ` por ${autor.nome}` : ""}.`
              : "Este exercício ainda não foi editado."}{" "}
            {personalizadas
              ? `${personalizadas} de ${SECOES_ANUAL.length} seções personalizadas para ${ano}; as demais seguem o texto padrão.`
              : "Todas as seções seguem o texto padrão; altere aqui só o que for específico deste exercício."}
            {relatorio?.emitidoEm ? ` Último PDF emitido em ${formatarDataHora(relatorio.emitidoEm)}.` : ""} Salve antes de gerar o PDF.
          </p>
          <FormRelatorioAnual modo="ano" ano={ano} iniciais={atuais} referencia={padrao} />
        </CardContent>
      </Card>
    </>
  );
}
