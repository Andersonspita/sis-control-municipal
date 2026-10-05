import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { exigirAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import { somenteDigitos } from "@/lib/documentos-br";
import type { Prisma } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CLASSE_SELECT, numeroPagina, texto } from "../comum";
import { Paginacao } from "../paginacao";
import { DialogoNovoUsuario } from "./dialogo-novo-usuario";

export const metadata: Metadata = { title: "Usuários" };

const POR_PAGINA = 30;

export default async function Usuarios({ searchParams }: PageProps<"/admin/usuarios">) {
  await exigirAdmin();
  const p = await searchParams;
  const busca = texto(p.busca).slice(0, 100);
  const situacao = texto(p.situacao);
  const pagina = numeroPagina(p.pagina);

  const filtros: Prisma.UsuarioWhereInput[] = [];
  if (busca) {
    const cpf = somenteDigitos(busca);
    filtros.push({
      OR: [
        { nome: { contains: busca, mode: "insensitive" } },
        { email: { contains: busca, mode: "insensitive" } },
        ...(cpf.length >= 3 ? [{ cpf: { contains: cpf } }] : []),
      ],
    });
  }
  if (situacao === "ativos") filtros.push({ ativo: true });
  if (situacao === "inativos") filtros.push({ ativo: false });
  if (situacao === "admin") filtros.push({ adminHorizon: true });
  const where: Prisma.UsuarioWhereInput = filtros.length ? { AND: filtros } : {};

  const [total, usuarios] = await Promise.all([
    db.usuario.count({ where }),
    db.usuario.findMany({
      where,
      orderBy: { nome: "asc" },
      skip: (pagina - 1) * POR_PAGINA,
      take: POR_PAGINA,
      select: {
        id: true,
        nome: true,
        email: true,
        adminHorizon: true,
        ativo: true,
        ultimoAcessoEm: true,
        vinculos: { where: { ativo: true }, select: { cliente: { select: { nome: true } } }, take: 3 },
        _count: { select: { vinculos: { where: { ativo: true } } } },
      },
    }),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Contas de acesso e vínculos com os clientes.</p>
        </div>
        <DialogoNovoUsuario />
      </div>

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="min-w-60 flex-1 space-y-1.5">
          <Label htmlFor="busca">Buscar</Label>
          <Input id="busca" name="busca" defaultValue={busca} placeholder="Nome, e-mail ou CPF" className="h-9" />
        </div>
        <div className="w-44 space-y-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <select id="situacao" name="situacao" defaultValue={situacao} className={CLASSE_SELECT}>
            <option value="">Todos</option>
            <option value="ativos">Ativos</option>
            <option value="inativos">Inativos</option>
            <option value="admin">Administradores</option>
          </select>
        </div>
        <Button type="submit" variant="outline" className="h-9">
          <Search aria-hidden="true" /> Filtrar
        </Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Usuários cadastrados</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Usuário</th>
                <th scope="col" className="px-3 py-3 font-medium">Clientes</th>
                <th scope="col" className="px-3 py-3 font-medium">Último acesso</th>
                <th scope="col" className="px-5 py-3 font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
              {usuarios.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-5 py-3">
                    <Link href={`/admin/usuarios/${u.id}`} className="block font-medium hover:underline">
                      {u.nome}
                    </Link>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {u._count.vinculos === 0 ? (
                      <span className="text-muted-foreground">Nenhum</span>
                    ) : (
                      <>
                        {u.vinculos.map((v) => v.cliente.nome).join(", ")}
                        {u._count.vinculos > u.vinculos.length && ` e mais ${u._count.vinculos - u.vinculos.length}`}
                      </>
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs tabular-nums">
                    {u.ultimoAcessoEm ? formatarDataHora(u.ultimoAcessoEm) : <span className="text-muted-foreground">Nunca</span>}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={u.ativo ? "secondary" : "outline"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
                      {u.adminHorizon && <Badge>Admin HorizonAJ</Badge>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Paginacao total={total} pagina={pagina} porPagina={POR_PAGINA} parametros={{ busca, situacao }} caminho="/admin/usuarios" />
    </>
  );
}
