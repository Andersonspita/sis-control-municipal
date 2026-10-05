import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, FileDown, FileSearch, Landmark, PencilLine, Send, Siren, type LucideIcon } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { numeroAuditoria } from "@/lib/auditorias";
import { STATUS_AUDITORIA, STATUS_CICLO } from "@/lib/rotulos";
import { anoAtual } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { PDF_RELATORIO } from "@/lib/relatorios/urls";

export const metadata: Metadata = { title: "Relatórios" };

const CLASSE_SELECT =
  "h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Unidade = { id: string; nome: string; sigla: string | null };

function rotulo(u: Unidade) {
  return u.sigla ? `${u.sigla} — ${u.nome}` : u.nome;
}

function CartaoRelatorio({
  icone: Icone,
  titulo,
  descricao,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  descricao: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icone aria-hidden className="size-4" />
          </span>
          {titulo}
        </CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SeletorUnidade({ id, unidades }: { id: string; unidades: Unidade[] }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Unidade</Label>
      <select id={id} name="unidade" defaultValue="" className={CLASSE_SELECT}>
        <option value="">Todas</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {rotulo(u)}
          </option>
        ))}
      </select>
    </div>
  );
}

function BotaoGerar({ desabilitado }: { desabilitado?: boolean }) {
  return (
    <Button type="submit" disabled={desabilitado}>
      <FileDown aria-hidden="true" />
      Gerar PDF
    </Button>
  );
}

export default async function Relatorios() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const { unidades, ciclos, auditorias } = await comCliente(ctx, async (tx) => ({
    unidades: await tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
    ciclos: await tx.cicloAvaliacao.findMany({
      where: { status: { not: "ARQUIVADO" } },
      orderBy: [{ dataInicio: "desc" }, { criadoEm: "desc" }],
      select: { id: true, nome: true, status: true },
    }),
    auditorias: await tx.auditoria.findMany({
      where: { status: { not: "CANCELADA" } },
      orderBy: [{ ano: "desc" }, { numero: "desc" }],
      take: 200,
      select: { id: true, numero: true, ano: true, titulo: true, status: true },
    }),
  }));
  const ano = anoAtual();
  const anos = [ano, ano - 1, ano - 2];

  return (
    <>
      <CabecalhoPagina
        titulo="Relatórios"
        descricao="Relatórios em PDF com o nome e o brasão da entidade. Cada emissão fica registrada na trilha de auditoria."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <CartaoRelatorio
          icone={Landmark}
          titulo="Relatório Anual de Controle Interno"
          descricao="Art. 17 da Res. TCM-BA 1.120/2005: números do exercício preenchidos automaticamente e textos do controlador."
        >
          <ul className="divide-y rounded-lg border">
            {anos.map((a) => (
              <li key={a} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="font-medium tabular-nums">Exercício {a}</span>
                <span className="flex gap-2">
                  <Link href={`/relatorios/anual/${a}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    <PencilLine aria-hidden="true" />
                    Editar textos
                  </Link>
                  <a href={PDF_RELATORIO.anual(a)} target="_blank" rel="noopener" className={buttonVariants({ size: "sm" })}>
                    <FileDown aria-hidden="true" />
                    Gerar PDF
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </CartaoRelatorio>

        <CartaoRelatorio
          icone={ClipboardCheck}
          titulo="Autoavaliação com plano de ação"
          descricao="Conformidade geral ponderada, por capítulo e por macrofunção, requisitos pendentes e ações 5W2H."
        >
          <form method="get" action="/relatorios/pdf/autoavaliacao" target="_blank" className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ciclo">Ciclo</Label>
              <select id="ciclo" name="ciclo" required className={CLASSE_SELECT}>
                {ciclos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {STATUS_CICLO[c.status]}
                  </option>
                ))}
              </select>
            </div>
            <SeletorUnidade id="unidade-ciclo" unidades={unidades} />
            <div>
              <BotaoGerar desabilitado={!ciclos.length} />
            </div>
            {!ciclos.length && <p className="text-sm text-muted-foreground sm:col-span-2">Nenhum ciclo de autoavaliação aberto.</p>}
          </form>
        </CartaoRelatorio>

        <CartaoRelatorio
          icone={Send}
          titulo="Demandas"
          descricao="Atendidas, vencidas e em aberto, com tempo médio de resposta por unidade (demandas criadas no período)."
        >
          <form method="get" action="/relatorios/pdf/demandas" target="_blank" className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="inicio">De</Label>
              <Input id="inicio" name="inicio" type="date" defaultValue={`${ano}-01-01`} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fim">Até</Label>
              <Input id="fim" name="fim" type="date" className="h-9" />
            </div>
            <SeletorUnidade id="unidade-demandas" unidades={unidades} />
            <div>
              <BotaoGerar />
            </div>
          </form>
        </CartaoRelatorio>

        <CartaoRelatorio
          icone={Siren}
          titulo="Painel de medidas"
          descricao="Situações por gravidade e status, matriz 5×5 das abertas e ações vinculadas."
        >
          <form method="get" action="/relatorios/pdf/medidas" target="_blank" className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <SeletorUnidade id="unidade-medidas" unidades={unidades} />
            <div>
              <BotaoGerar />
            </div>
          </form>
        </CartaoRelatorio>

        <CartaoRelatorio
          icone={FileSearch}
          titulo="Relatório de auditoria"
          descricao="Dados, escopo, critérios, matriz de planejamento, achados (condição, critério, causa e efeito) e recomendações."
        >
          <form method="get" action="/relatorios/pdf/auditoria" target="_blank" className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="auditoria">Auditoria</Label>
              <select id="auditoria" name="id" required className={CLASSE_SELECT}>
                {auditorias.map((a) => (
                  <option key={a.id} value={a.id}>
                    {numeroAuditoria(a.numero, a.ano)} — {a.titulo} · {STATUS_AUDITORIA[a.status]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="versao">Versão</Label>
              <select id="versao" name="versao" defaultValue="" className={CLASSE_SELECT}>
                <option value="">Conforme a etapa da auditoria</option>
                <option value="preliminar">Preliminar</option>
                <option value="final">Final</option>
              </select>
            </div>
            <div>
              <BotaoGerar desabilitado={!auditorias.length} />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Antes do relatório final, o PDF sai sempre como preliminar, com marca d&apos;água.
            </p>
          </form>
        </CartaoRelatorio>
      </div>
    </>
  );
}
