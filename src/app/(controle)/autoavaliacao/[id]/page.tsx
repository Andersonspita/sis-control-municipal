import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileDown, ListChecks, Lock, Sparkles } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { carregarCiclo } from "@/lib/dados/autoavaliacao";
import { obterEstadoIA } from "@/lib/ia/analises";
import { pendentesPorResposta } from "@/lib/ia/dados";
import { AvisoIA } from "@/components/ia/aviso-ia";
import { CompararComNorma } from "@/components/ia/comparar-com-norma";
import { ProvedorIACiclo } from "@/components/ia/ia-ciclo";
import { formatarDataSimples } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { SeloStatusCiclo } from "@/components/selos-status";
import { buttonVariants } from "@/components/ui/button";
import { PDF_RELATORIO } from "@/lib/relatorios/urls";
import { AvaliacaoCiclo } from "./avaliacao-ciclo";

export const metadata: Metadata = { title: "Ciclo de autoavaliação" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" });

export default async function DetalheCiclo({ params }: PageProps<"/autoavaliacao/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = await carregarCiclo(ctx, (await params).id);
  if (!dados) notFound();
  const { ciclo, nos, respostas, anterior } = dados;
  const bloqueado = ciclo.status !== "EM_ANDAMENTO";
  const [estadoIA, pendentes, documentos] = await Promise.all([
    obterEstadoIA(),
    pendentesPorResposta(ctx, ciclo.id),
    bloqueado
      ? []
      : comCliente(ctx, (tx) => tx.documento.findMany({ orderBy: { criadoEm: "desc" }, take: 200, select: { id: true, nome: true } })),
  ]);
  const totalPendentes = Object.values(pendentes).reduce((s, n) => s + n, 0);
  const alcance = ciclo.unidade
    ? `Unidade: ${ciclo.unidade.sigla ? `${ciclo.unidade.sigla} — ` : ""}${ciclo.unidade.nome}`
    : "Entidade inteira";
  const periodo = `${formatarDataSimples(ciclo.dataInicio)}${ciclo.dataFim ? ` a ${formatarDataSimples(ciclo.dataFim)}` : " — em aberto"}`;

  return (
    <>
      <Link
        href="/autoavaliacao"
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Autoavaliação
      </Link>
      <CabecalhoPagina
        titulo={`${ciclo.nome} · ${ciclo.norma.codigo}`}
        descricao={`${ciclo.norma.titulo}. ${alcance}. Período: ${periodo}.`}
        acoes={
          <>
            <SeloStatusCiclo status={ciclo.status} />
            <a href={PDF_RELATORIO.autoavaliacao(ciclo.id)} target="_blank" rel="noopener" className={buttonVariants({ variant: "outline" })}>
              <FileDown aria-hidden="true" />
              Relatório (PDF)
            </a>
          </>
        }
      />

      {bloqueado && (
        <p role="status" className="mb-6 flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <Lock aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            Ciclo encerrado{ciclo.concluidoEm && ` em ${dataHora.format(ciclo.concluidoEm)}`}. As respostas estão congeladas e
            ficam disponíveis apenas para consulta e comparação.
          </span>
        </p>
      )}

      {ciclo.planos.length > 0 && (
        <ul className="mb-6 flex flex-wrap gap-2" aria-label="Planos de ação vinculados">
          {ciclo.planos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/planos/${p.id}`}
                className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted/50"
              >
                <ListChecks aria-hidden="true" className="size-4 text-primary" />
                {p.titulo}
                <span className="text-muted-foreground">· {p._count.acoes} ações</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!bloqueado && (
        <details className="group mb-6 rounded-xl border bg-card" open={totalPendentes > 0 || undefined}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium sm:px-5">
            <span className="inline-flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-4 text-primary" />
              Analisar documento com IA
            </span>
            {totalPendentes > 0 && (
              <Link href={`/ia?ciclo=${ciclo.id}`} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                {totalPendentes} sugestão(ões) pendente(s) de revisão
              </Link>
            )}
          </summary>
          <div className="space-y-3 border-t px-4 py-4 sm:px-5">
            <p className="text-sm text-muted-foreground">
              A IA compara o documento escolhido com cada requisito desta norma e sugere a resposta, citando o trecho e a página.
              Nada é aplicado sem a sua revisão.
            </p>
            <AvisoIA motivo={estadoIA.motivo} admin={ctx.usuario.adminHorizon} />
            <CompararComNorma ciclos={[{ id: ciclo.id, nome: ciclo.nome }]} documentos={documentos} disponivel={estadoIA.disponivel} />
          </div>
        </details>
      )}

      <ProvedorIACiclo cicloId={ciclo.id} pendentes={pendentes} disponivel={estadoIA.disponivel} motivo={estadoIA.motivo}>
        <AvaliacaoCiclo
          cicloId={ciclo.id}
          bloqueado={bloqueado}
          podeConcluir={ctx.perfil === "CONTROLADOR"}
          nos={nos}
          respostasIniciais={respostas}
          anterior={anterior ? { id: anterior.id, nome: anterior.nome, respostas: anterior.respostas } : null}
          planoId={ciclo.planos[0]?.id ?? null}
        />
      </ProvedorIACiclo>
    </>
  );
}
