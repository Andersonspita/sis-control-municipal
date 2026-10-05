import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { comClienteComoAdmin, exigirAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { PERFIL } from "@/lib/rotulos";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BotaoSituacao } from "../../botao-situacao";
import { alterarSituacaoUsuario, alterarSituacaoVinculo } from "../actions";
import { DialogoVinculo, FormEditarUsuario, FormSenha } from "./formularios";

export const metadata: Metadata = { title: "Usuário" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function DetalheUsuario({ params }: PageProps<"/admin/usuarios/[id]">) {
  const sessao = await exigirAdmin();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const [usuario, clientes] = await Promise.all([
    db.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        cpf: true,
        adminHorizon: true,
        ativo: true,
        ultimoAcessoEm: true,
        criadoEm: true,
        _count: { select: { sessoes: { where: { expiraEm: { gt: new Date() } } } } },
        vinculos: {
          orderBy: [{ ativo: "desc" }, { cliente: { nome: "asc" } }],
          select: {
            id: true,
            perfil: true,
            cargo: true,
            ativo: true,
            cliente: { select: { id: true, nome: true, municipio: true, uf: true, ativo: true } },
          },
        },
      },
    }),
    db.cliente.findMany({
      where: { ativo: true },
      orderBy: [{ municipio: "asc" }, { nome: "asc" }],
      select: { id: true, nome: true, municipio: true, uf: true },
    }),
  ]);
  if (!usuario) notFound();

  // Escopo dos satélites: tabela por cliente, lida no contexto de cada cliente.
  const escopos = new Map(
    await Promise.all(
      usuario.vinculos
        .filter((v) => v.perfil === "SATELITE")
        .map(
          async (v) =>
            [
              v.id,
              await comClienteComoAdmin(sessao.usuario.id, v.cliente.id, (tx) =>
                tx.escopoSatelite.findMany({
                  where: { vinculoId: v.id },
                  select: { unidade: { select: { id: true, nome: true, sigla: true } } },
                  orderBy: { unidade: { nome: "asc" } },
                }),
              ),
            ] as const,
        ),
    ),
  );

  const vinculados = new Set(usuario.vinculos.map((v) => v.cliente.id));
  const proprio = usuario.id === sessao.usuario.id;

  return (
    <>
      <Link href="/admin/usuarios" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline">
        <ArrowLeft className="size-4" aria-hidden="true" /> Usuários
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">{usuario.nome}</h1>
          <p className="text-sm text-muted-foreground">
            {usuario.email} · último acesso {usuario.ultimoAcessoEm ? formatarDataHora(usuario.ultimoAcessoEm) : "nunca"} ·{" "}
            {usuario._count.sessoes} {usuario._count.sessoes === 1 ? "sessão ativa" : "sessões ativas"}
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            <Badge variant={usuario.ativo ? "secondary" : "outline"}>{usuario.ativo ? "Ativo" : "Inativo"}</Badge>
            {usuario.adminHorizon && <Badge>Admin HorizonAJ</Badge>}
          </div>
        </div>
        {!proprio && (
          <BotaoSituacao
            acao={alterarSituacaoUsuario}
            id={usuario.id}
            ativo={usuario.ativo}
            nome={usuario.nome}
            aviso="O usuário perde o acesso e todas as sessões ativas são encerradas. Vínculos e histórico são preservados."
          />
        )}
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Vínculos com clientes</CardTitle>
            <CardDescription>Clientes que o usuário acessa e com qual perfil.</CardDescription>
          </div>
          <DialogoVinculo usuarioId={usuario.id} clientes={clientes.filter((c) => !vinculados.has(c.id))} />
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Vínculos do usuário</caption>
            <thead>
              <tr className="border-y text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Cliente</th>
                <th scope="col" className="px-3 py-3 font-medium">Perfil</th>
                <th scope="col" className="px-3 py-3 font-medium">Escopo</th>
                <th scope="col" className="px-3 py-3 font-medium">Situação</th>
                <th scope="col" className="px-5 py-3 font-medium">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {usuario.vinculos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum vínculo. Sem vínculo ativo o usuário não acessa nenhum cliente.
                  </td>
                </tr>
              )}
              {usuario.vinculos.map((v) => {
                const unidades = escopos.get(v.id)?.map((e) => e.unidade) ?? [];
                return (
                  <tr key={v.id} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      <span className="block font-medium">{v.cliente.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {v.cliente.municipio}/{v.cliente.uf}
                        {!v.cliente.ativo && " · cliente inativo"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {PERFIL[v.perfil]}
                      {v.cargo && <span className="block text-xs text-muted-foreground">{v.cargo}</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {v.perfil !== "SATELITE" ? (
                        <span className="text-muted-foreground">Todo o cliente</span>
                      ) : unidades.length === 0 ? (
                        <span className="text-destructive">Sem unidades definidas</span>
                      ) : (
                        unidades.map((u) => u.sigla ?? u.nome).join(", ")
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant={v.ativo ? "secondary" : "outline"}>{v.ativo ? "Ativo" : "Inativo"}</Badge>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <DialogoVinculo
                          usuarioId={usuario.id}
                          clientes={clientes}
                          vinculo={{
                            clienteId: v.cliente.id,
                            clienteNome: v.cliente.nome,
                            perfil: v.perfil,
                            cargo: v.cargo,
                            unidadeIds: unidades.map((u) => u.id),
                          }}
                        />
                        <BotaoSituacao
                          acao={alterarSituacaoVinculo}
                          id={v.id}
                          ativo={v.ativo}
                          nome={`vínculo com ${v.cliente.nome}`}
                          aviso="O usuário deixa de acessar este cliente. O escopo e o histórico são preservados."
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Dados do usuário</CardTitle>
            <CardDescription>Cadastrado em {formatarDataHora(usuario.criadoEm)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormEditarUsuario
              usuario={{ id: usuario.id, nome: usuario.nome, email: usuario.email, cpf: usuario.cpf, adminHorizon: usuario.adminHorizon }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Redefinir senha</CardTitle>
            <CardDescription>Informe a nova senha ao usuário por um canal seguro.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormSenha usuarioId={usuario.id} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
