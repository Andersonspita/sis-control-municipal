import type { Metadata } from "next";
import { exigirAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { mascararCnpj } from "@/lib/documentos-br";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIPO_CLIENTE } from "@/lib/rotulos";
import { alterarSituacaoCliente, alterarSituacaoMunicipio } from "./actions";
import { BotaoSituacao } from "./botao-situacao";
import { DialogoCliente } from "./dialogo-cliente";
import { DialogoMunicipio } from "./dialogo-municipio";
import { LinkMunicipio } from "./link-municipio";

export const metadata: Metadata = { title: "Clientes" };

export default async function Admin() {
  await exigirAdmin();

  const [clientes, municipios] = await Promise.all([
    db.cliente.findMany({
      orderBy: [{ municipio: "asc" }, { nome: "asc" }],
      select: {
        id: true,
        nome: true,
        tipo: true,
        cnpj: true,
        municipioId: true,
        municipio: true,
        uf: true,
        populacao: true,
        ativo: true,
        municipioCadastro: { select: { slug: true, ativo: true } },
        _count: { select: { vinculos: { where: { ativo: true } } } },
      },
    }),
    db.municipio.findMany({
      orderBy: [{ nome: "asc" }, { uf: "asc" }],
      select: {
        id: true,
        slug: true,
        nome: true,
        uf: true,
        codigoIbge: true,
        ativo: true,
        _count: { select: { clientes: true } },
      },
    }),
  ]);
  const opcoesMunicipio = municipios.map((m) => ({
    id: m.id,
    slug: m.slug,
    nome: m.nome,
    uf: m.uf,
    codigoIbge: m.codigoIbge,
    ativo: m.ativo,
  }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">Cada entidade é um cliente isolado, com seus próprios usuários e dados.</p>
        </div>
        <DialogoCliente municipios={opcoesMunicipio} />
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
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      {c.municipio}/{c.uf}
                      {c.municipioCadastro?.ativo && <LinkMunicipio slug={c.municipioCadastro.slug} nome={`${c.municipio}/${c.uf}`} />}
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
                      <DialogoCliente cliente={c} municipios={opcoesMunicipio} />
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

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Municípios e links de acesso</h2>
        <p className="text-sm text-muted-foreground">
          Cada município tem um link próprio que reúne suas entidades. Por ele só entram usuários vinculados a alguma
          entidade do município e a equipe HorizonAJ.
        </p>
      </div>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Municípios e links de acesso</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Município</th>
                <th scope="col" className="px-3 py-3 font-medium">Link de acesso</th>
                <th scope="col" className="px-3 py-3 font-medium">IBGE</th>
                <th scope="col" className="px-3 py-3 font-medium">Entidades</th>
                <th scope="col" className="px-3 py-3 font-medium">Link</th>
                <th scope="col" className="px-5 py-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {municipios.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum município cadastrado. Ele é criado junto com o primeiro cliente.
                  </td>
                </tr>
              )}
              {municipios.map(({ _count, ...m }) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="px-5 py-3 font-medium">
                    {m.nome}/{m.uf}
                  </td>
                  <td className="px-3 py-3">
                    <LinkMunicipio slug={m.slug} nome={`${m.nome}/${m.uf}`} />
                  </td>
                  <td className="px-3 py-3 font-mono text-xs">{m.codigoIbge ?? "—"}</td>
                  <td className="px-3 py-3 tabular-nums">{_count.clientes}</td>
                  <td className="px-3 py-3">
                    <Badge variant={m.ativo ? "secondary" : "outline"}>{m.ativo ? "Ativo" : "Inativo"}</Badge>
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      <DialogoMunicipio municipio={m} />
                      <BotaoSituacao
                        acao={alterarSituacaoMunicipio}
                        id={m.id}
                        ativo={m.ativo}
                        nome={`o link de ${m.nome}/${m.uf}`}
                        aviso="O link deixa de funcionar e quem entrou por ele é desconectado. As entidades continuam acessíveis pelo login geral."
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
