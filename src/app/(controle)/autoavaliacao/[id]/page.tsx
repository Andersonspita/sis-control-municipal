import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks, Lock } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { carregarCiclo } from "@/lib/dados/autoavaliacao";
import { formatarDataSimples } from "@/lib/datas";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { SeloStatusCiclo } from "@/components/selos-status";
import { AvaliacaoCiclo } from "./avaliacao-ciclo";

export const metadata: Metadata = { title: "Ciclo de autoavaliação" };

const dataHora = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bahia" });

export default async function DetalheCiclo({ params }: PageProps<"/autoavaliacao/[id]">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = await carregarCiclo(ctx, (await params).id);
  if (!dados) notFound();
  const { ciclo, nos, respostas, anterior } = dados;
  const bloqueado = ciclo.status !== "EM_ANDAMENTO";
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
        acoes={<SeloStatusCiclo status={ciclo.status} />}
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

      <AvaliacaoCiclo
        cicloId={ciclo.id}
        bloqueado={bloqueado}
        podeConcluir={ctx.perfil === "CONTROLADOR"}
        nos={nos}
        respostasIniciais={respostas}
        anterior={anterior ? { id: anterior.id, nome: anterior.nome, respostas: anterior.respostas } : null}
        planoId={ciclo.planos[0]?.id ?? null}
      />
    </>
  );
}
