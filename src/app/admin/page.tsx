import type { Metadata } from "next";
import { exigirAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { mascararCnpj } from "@/lib/documentos-br";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { alterarSituacaoCliente } from "./actions";
import { BotaoSituacao } from "./botao-situacao";
import { DialogoCliente } from "./dialogo-cliente";

export const metadata: Metadata = { title: "Clientes" };

export default async function Admin() {
  await exigirAdmin();

  const clientes = await db.cliente.findMany({
    orderBy: [{ municipio: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      tipo: true,
      cnpj: true,
      municipio: true,
      uf: true,
      codigoIbge: true,
      populacao: true,
      ativo: true,
      _count: { select: { vinculos: { where: { ativo: true } } } },
    },
  });

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cada entidade é um cliente isolado, com seus próprios usuários e dados.</p>
        </div>
        <DialogoCliente />
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Clientes cadastrados</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Entidade</th>
                <th scope="col" className="px-3 py-3 font-medium">Tipo</th>
                <th scope="col" className="px-3 py-3 font-medium">CNPJ</th>
                <th scope="col" className="px-3 py-3 font-medium">Usuários</th>
                <th scope="col" className="px-3 py-3 font-medium">Situação</th>
                <th scope="col" className="px-5 py-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {clientes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum cliente cadastrado.
                  </td>
                </tr>
              )}
              {clientes.map((c) => (
                <tr key={c.id} className="border-b last:border-0">
                  <td className="px-5 py-3">
                    <span className="block font-medium">{c.nome}</span>
                    <span className="text-xs text-muted-foreground">
                      {c.municipio}/{c.uf}
                    </span>
                  </td>
                  <td className="px-3 py-3">{TIPO_CLIENTE[c.tipo]}</td>
                  <td className="px-3 py-3 font-mono text-xs">{mascararCnpj(c.cnpj)}</td>
                  <td className="px-3 py-3 tabular-nums">{c._count.vinculos}</td>
                  <td className="px-3 py-3">
                    <Badge variant={c.ativo ? "secondary" : "outline"}>{c.ativo ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <DialogoCliente cliente={c} />
                      <BotaoSituacao
                        acao={alterarSituacaoCliente}
                        id={c.id}
                        ativo={c.ativo}
                        nome={c.nome}
                        aviso="Nenhum usuário conseguirá acessar este cliente enquanto ele estiver inativo. Os dados são preservados."
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </>
  );
}
