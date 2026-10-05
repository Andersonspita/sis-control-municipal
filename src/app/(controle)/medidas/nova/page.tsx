import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { FormSituacao } from "../form-situacao";

export const metadata: Metadata = { title: "Nova situação" };

export default async function NovaSituacao() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const unidades = await comCliente(ctx, (tx) =>
    tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
  );

  return (
    <>
      <CabecalhoPagina
        titulo="Nova situação"
        descricao="Registre a situação que precisa de intervenção; depois crie o plano de ação geral para tratá-la."
        acoes={
          <Link href="/medidas" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Voltar às medidas
          </Link>
        }
      />
      <div className="max-w-3xl">
        <Card>
          <CardContent>
            <FormSituacao unidades={unidades} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
