import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { hojeComoDataSimples, paraCampoData, somarDias } from "@/lib/datas";
import { FormDemanda } from "./form-demanda";

export const metadata: Metadata = { title: "Nova demanda" };

export default async function NovaDemanda() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const unidades = await comCliente(ctx, (tx) =>
    tx.unidade.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: { id: true, nome: true, sigla: true, responsavelNome: true },
    }),
  );
  const hoje = hojeComoDataSimples();

  return (
    <>
      <CabecalhoPagina
        titulo="Nova demanda"
        descricao="A unidade destinatária recebe a demanda na caixa dela e responde com texto e anexos dentro do prazo."
        acoes={
          <Link href="/demandas" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Voltar às demandas
          </Link>
        }
      />
      <Card className="max-w-3xl">
        <CardContent>
          {unidades.length === 0 ? (
            <p className="py-6 text-center text-muted-foreground">
              Cadastre ao menos uma{" "}
              <Link href="/unidades" className="font-medium text-primary underline-offset-4 hover:underline">
                unidade
              </Link>{" "}
              antes de enviar demandas.
            </p>
          ) : (
            <FormDemanda unidades={unidades} prazoMinimo={paraCampoData(hoje)} prazoPadrao={paraCampoData(somarDias(hoje, 15))} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
