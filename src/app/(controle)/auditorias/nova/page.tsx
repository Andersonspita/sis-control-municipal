import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { membrosControle } from "@/lib/dados/auditorias";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { FormAuditoria } from "../form-auditoria";

export const metadata: Metadata = { title: "Nova auditoria" };

export default async function NovaAuditoria() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const [unidades, membros] = await Promise.all([
    comCliente(ctx, (tx) =>
      tx.unidade.findMany({ where: { ativo: true }, orderBy: { nome: "asc" }, select: { id: true, nome: true, sigla: true } }),
    ),
    membrosControle(ctx.clienteId),
  ]);

  return (
    <>
      <CabecalhoPagina
        titulo="Nova auditoria"
        descricao="Auditoria fora do PAAI (especial ou não prevista). As previstas no plano anual são iniciadas a partir do PAAI aprovado."
        acoes={
          <Link href="/auditorias" className={buttonVariants({ variant: "outline", size: "lg" })}>
            <ArrowLeft aria-hidden="true" />
            Voltar às auditorias
          </Link>
        }
      />
      <div className="max-w-3xl">
        <Card>
          <CardContent>
            <FormAuditoria unidades={unidades} membros={membros} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
