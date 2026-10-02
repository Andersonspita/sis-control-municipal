import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { exigirUsuario } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { sair } from "@/app/actions/sessao";
import { Marca } from "@/components/marca";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIPO_CLIENTE } from "@/lib/rotulos";

export const metadata: Metadata = { title: "Administração HorizonAJ" };

export default async function Admin() {
  const sessao = await exigirUsuario();
  if (!sessao.usuario.adminHorizon) redirect("/");

  const clientes = await db.cliente.findMany({
    orderBy: [{ municipio: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      tipo: true,
      cnpj: true,
      municipio: true,
      uf: true,
      ativo: true,
      _count: { select: { vinculos: { where: { ativo: true } } } },
    },
  });

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Marca />
          <form action={sair}>
            <Button type="submit" variant="ghost" className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
              <LogOut aria-hidden="true" /> Sair
            </Button>
          </form>
        </div>
      </header>
      <main id="conteudo" className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Cada entidade é um cliente isolado. O cadastro de clientes e usuários pela interface entra na próxima etapa.
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">Clientes cadastrados</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Entidade</th>
                  <th scope="col" className="px-3 py-3 font-medium">Tipo</th>
                  <th scope="col" className="px-3 py-3 font-medium">CNPJ</th>
                  <th scope="col" className="px-3 py-3 font-medium">Usuários</th>
                  <th scope="col" className="px-5 py-3 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      <span className="block font-medium">{c.nome}</span>
                      <span className="text-xs text-muted-foreground">{c.municipio}/{c.uf}</span>
                    </td>
                    <td className="px-3 py-3">{TIPO_CLIENTE[c.tipo]}</td>
                    <td className="px-3 py-3 font-mono text-xs">
                      {c.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{c._count.vinculos}</td>
                    <td className="px-5 py-3">
                      <Badge variant={c.ativo ? "secondary" : "outline"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
