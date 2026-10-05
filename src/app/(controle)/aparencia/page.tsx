import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { obterTema } from "@/lib/temas";
import { SeletorTema } from "./seletor-tema";

export const metadata: Metadata = { title: "Aparência" };

export default async function PaginaAparencia() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const atual = obterTema(ctx.cliente.tema);
  const podeAlterar = ctx.perfil === "CONTROLADOR";

  return (
    <>
      <CabecalhoPagina
        titulo="Aparência do sistema"
        descricao={`Identidade visual de ${ctx.cliente.nome}. O tema escolhido vale para todos os usuários desta entidade, inclusive os satélites; cada entidade pode ter o seu.`}
      />
      {!podeAlterar && (
        <p className="mb-6 flex items-center gap-2 rounded-md border bg-info-fundo px-4 py-3 text-sm text-info">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          Somente o controlador pode alterar o tema. Tema atual: {atual.nome}.
        </p>
      )}
      <SeletorTema atual={atual.id} podeAlterar={podeAlterar} />
      <p className="mt-8 text-sm text-muted-foreground">
        Quer comparar as telas em detalhe?{" "}
        <Link href="/propostas-visuais" className="font-medium text-primary underline underline-offset-2">
          Ver as propostas de identidade visual
        </Link>
        .
      </p>
    </>
  );
}
