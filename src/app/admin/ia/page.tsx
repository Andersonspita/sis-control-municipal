import type { Metadata } from "next";
import Link from "next/link";
import { SecaoConfigIA } from "./secao";

export const metadata: Metadata = { title: "Inteligência artificial" };

export default function ConfiguracaoIA() {
  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Inteligência artificial</h1>
        <p className="text-sm text-muted-foreground">
          Provedor, chaves e modelos usados pela controladoria na análise de documentos. O satélite nunca usa a IA. Também
          disponível em{" "}
          <Link href="/configuracoes?aba=ia" className="underline underline-offset-4">
            Configurações
          </Link>
          .
        </p>
      </div>
      <SecaoConfigIA />
    </>
  );
}
