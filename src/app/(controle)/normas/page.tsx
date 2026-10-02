import type { Metadata } from "next";
import Link from "next/link";
import { format } from "date-fns";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIPO_CLIENTE } from "@/lib/rotulos";

export const metadata: Metadata = { title: "Normas" };

export default async function Normas() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const normas = await db.norma.findMany({
    where: { ativo: true },
    orderBy: { codigo: "asc" },
    select: {
      id: true,
      codigo: true,
      versao: true,
      titulo: true,
      orgaoEmissor: true,
      dataPublicacao: true,
      descricao: true,
      _count: {
        select: { requisitos: { where: { avaliavel: true, tiposEntidade: { has: ctx.cliente.tipo } } } },
      },
    },
  });

  return (
    <>
      <CabecalhoPagina
        titulo="Normas"
        descricao={`Catálogos de requisitos disponíveis para autoavaliação. As contagens consideram apenas o que se aplica a ${TIPO_CLIENTE[ctx.cliente.tipo].toLowerCase()}.`}
      />
      <ul className="grid gap-4 lg:grid-cols-2">
        {normas.map((n) => (
          <li key={n.id}>
            <Link href={`/normas/${n.id}`} className="group block h-full rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <Card className="h-full transition-colors group-hover:ring-primary/30">
                <CardContent className="flex h-full flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <BookOpenCheck aria-hidden="true" className="size-5" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="font-heading font-semibold leading-snug">{n.titulo}</p>
                      <p className="text-sm text-muted-foreground">
                        {n.orgaoEmissor}
                        {n.dataPublicacao && ` · ${format(n.dataPublicacao, "MM/yyyy")}`}
                      </p>
                    </div>
                  </div>
                  {n.descricao && <p className="line-clamp-3 text-sm text-muted-foreground">{n.descricao}</p>}
                  <div className="mt-auto flex items-center justify-between">
                    <Badge variant="secondary">{n._count.requisitos} requisitos avaliáveis</Badge>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Ver requisitos <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
