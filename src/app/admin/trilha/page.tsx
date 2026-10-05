import type { Metadata } from "next";
import { Search } from "lucide-react";
import { comAdmin, exigirAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { formatarDataHora } from "@/lib/datas";
import type { Prisma } from "@/generated/prisma/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { numeroPagina, texto } from "../comum";
import { Paginacao } from "../paginacao";

export const metadata: Metadata = { title: "Trilha global" };

const POR_PAGINA = 50;
const DATA = /^\d{4}-\d{2}-\d{2}$/;

/** Início do dia (ou do dia seguinte) no fuso de Brasília, em UTC. */
function inicioDoDia(data: string, somarDia = false) {
  const d = new Date(`${data}T00:00:00-03:00`);
  if (somarDia) d.setUTCDate(d.getUTCDate() + 1);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function TrilhaGlobal({ searchParams }: PageProps<"/admin/trilha">) {
  const sessao = await exigirAdmin();
  const p = await searchParams;
  const acao = texto(p.acao).slice(0, 80);
  const usuario = texto(p.usuario).slice(0, 100);
  const de = DATA.test(texto(p.de)) ? texto(p.de) : "";
  const ate = DATA.test(texto(p.ate)) ? texto(p.ate) : "";
  const pagina = numeroPagina(p.pagina);

  const filtros: Prisma.LogAuditoriaWhereInput[] = [{ clienteId: null }];
  if (acao) filtros.push({ acao: { contains: acao, mode: "insensitive" } });
  if (usuario) {
    const encontrados = await db.usuario.findMany({
      where: {
        OR: [{ nome: { contains: usuario, mode: "insensitive" } }, { email: { contains: usuario, mode: "insensitive" } }],
      },
      select: { id: true },
      take: 200,
    });
    filtros.push({ usuarioId: { in: encontrados.map((u) => u.id) } });
  }
  const desde = de && inicioDoDia(de);
  const antes = ate && inicioDoDia(ate, true);
  if (desde) filtros.push({ criadoEm: { gte: desde } });
  if (antes) filtros.push({ criadoEm: { lt: antes } });
  const where: Prisma.LogAuditoriaWhereInput = { AND: filtros };

  const [total, registros] = await comAdmin(sessao.usuario.id, (tx) =>
    Promise.all([
      tx.logAuditoria.count({ where }),
      tx.logAuditoria.findMany({
        where,
        orderBy: { id: "desc" },
        skip: (pagina - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: { id: true, acao: true, usuarioId: true, entidade: true, entidadeId: true, dados: true, ip: true, criadoEm: true },
      }),
    ]),
  );

  const ids = [...new Set(registros.map((r) => r.usuarioId).filter((v): v is string => !!v))];
  const usuarios = new Map(
    (await db.usuario.findMany({ where: { id: { in: ids } }, select: { id: true, nome: true, email: true } })).map((u) => [u.id, u]),
  );

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Trilha global</h1>
        <p className="text-sm text-muted-foreground">
          Eventos sem cliente: acessos, falhas de autenticação e ações da administração HorizonAJ. A trilha é imutável.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" role="search">
        <div className="w-56 space-y-1.5">
          <Label htmlFor="acao">Ação</Label>
          <Input id="acao" name="acao" defaultValue={acao} placeholder="Ex.: login, admin.usuario" className="h-9" />
        </div>
        <div className="min-w-56 flex-1 space-y-1.5">
          <Label htmlFor="usuario">Usuário</Label>
          <Input id="usuario" name="usuario" defaultValue={usuario} placeholder="Nome ou e-mail" className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="de">De</Label>
          <Input id="de" name="de" type="date" defaultValue={de} className="h-9" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ate">Até</Label>
          <Input id="ate" name="ate" type="date" defaultValue={ate} className="h-9" />
        </div>
        <Button type="submit" variant="outline" className="h-9">
          <Search aria-hidden="true" /> Filtrar
        </Button>
      </form>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <caption className="sr-only">Registros da trilha global</caption>
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-5 py-3 font-medium">Quando</th>
                <th scope="col" className="px-3 py-3 font-medium">Ação</th>
                <th scope="col" className="px-3 py-3 font-medium">Usuário</th>
                <th scope="col" className="px-3 py-3 font-medium">Detalhes</th>
                <th scope="col" className="px-5 py-3 font-medium">IP</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
              {registros.map((r) => {
                const u = r.usuarioId ? usuarios.get(r.usuarioId) : undefined;
                return (
                  <tr key={r.id.toString()} className="border-b align-top last:border-0">
                    <td className="whitespace-nowrap px-5 py-3 text-xs tabular-nums">{formatarDataHora(r.criadoEm)}</td>
                    <td className="px-3 py-3 font-mono text-xs">{r.acao}</td>
                    <td className="px-3 py-3 text-xs">
                      {u ? (
                        <>
                          <span className="block">{u.nome}</span>
                          <span className="text-muted-foreground">{u.email}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="max-w-md px-3 py-3 text-xs">
                      {r.entidade && (
                        <span className="block text-muted-foreground">
                          {r.entidade}
                          {r.entidadeId && ` ${r.entidadeId}`}
                        </span>
                      )}
                      {r.dados != null && (
                        <code className="block break-all font-mono text-[0.7rem] text-foreground/80">{JSON.stringify(r.dados)}</code>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{r.ip ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
      <Paginacao total={total} pagina={pagina} porPagina={POR_PAGINA} parametros={{ acao, usuario, de, ate }} caminho="/admin/trilha" />
    </>
  );
}
