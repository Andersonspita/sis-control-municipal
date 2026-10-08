import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { ORIGEM_SITUACAO } from "@/lib/rotulos";
import type { OrigemSituacao } from "@/generated/prisma/enums";
import { FormSituacao } from "../form-situacao";

export const metadata: Metadata = { title: "Novo alerta" };

const texto = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const escala = (v: string | string[] | undefined) => {
  const n = Number(texto(v));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
};

export default async function NovaSituacao(props: PageProps<"/alertas/nova">) {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  // Pré-preenchimento vindo de outras telas (ex.: alertas de Dados externos); o usuário revisa antes de registrar.
  const sp = await props.searchParams;
  const origem = texto(sp.origem);
  const sugestao = {
    titulo: texto(sp.titulo)?.slice(0, 200),
    descricao: texto(sp.descricao)?.slice(0, 10000),
    origem: origem && origem in ORIGEM_SITUACAO ? (origem as OrigemSituacao) : undefined,
    probabilidade: escala(sp.probabilidade),
    impacto: escala(sp.impacto),
  };
  const unidades = await comCliente(ctx, (tx) =>
    tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Novo alerta"
        descricao="Registre o alerta (situação) que precisa de intervenção; depois crie o plano de ação geral para tratá-la."
        acoes={
          <Link href="/alertas" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Voltar aos alertas
          </Link>
        }
      />
      <div className="max-w-3xl">
        <Card>
          <CardContent>
            <FormSituacao unidades={unidades} sugestao={sugestao} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
