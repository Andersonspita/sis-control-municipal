import type { Metadata } from "next";
import { CornerDownRight } from "lucide-react";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente } from "@/lib/db";
import { CabecalhoPagina } from "@/components/shell/app-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIPO_UNIDADE } from "@/lib/rotulos";
import { FormUnidade } from "./form-unidade";

export const metadata: Metadata = { title: "Unidades" };

type Unidade = {
  id: string;
  nome: string;
  sigla: string | null;
  tipo: keyof typeof TIPO_UNIDADE;
  paiId: string | null;
  responsavelNome: string | null;
  _count: { demandas: number };
};

function ordenarEmArvore(unidades: Unidade[]) {
  const filhos = new Map<string | null, Unidade[]>();
  for (const u of unidades) {
    const chave = u.paiId && unidades.some((p) => p.id === u.paiId) ? u.paiId : null;
    filhos.set(chave, [...(filhos.get(chave) ?? []), u]);
  }
  const saida: { unidade: Unidade; nivel: number }[] = [];
  const visitar = (pai: string | null, nivel: number) => {
    for (const u of filhos.get(pai) ?? []) {
      saida.push({ unidade: u, nivel });
      visitar(u.id, nivel + 1);
    }
  };
  visitar(null, 0);
  return saida;
}

export default async function Unidades() {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const unidades = await comCliente(ctx, (tx) =>
    tx.unidade.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        sigla: true,
        tipo: true,
        paiId: true,
        responsavelNome: true,
        _count: { select: { demandas: true } },
      },
    }),
  );
  const linhas = ordenarEmArvore(unidades);

  return (
    <>
      <CabecalhoPagina
        titulo="Unidades"
        descricao="Estrutura organizacional usada para direcionar demandas, atribuir ações e definir o escopo de quem tem acesso restrito."
      />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <caption className="sr-only">Unidades cadastradas</caption>
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="px-5 py-3 font-medium">Unidade</th>
                  <th scope="col" className="px-3 py-3 font-medium">Tipo</th>
                  <th scope="col" className="hidden px-3 py-3 font-medium md:table-cell">Responsável</th>
                  <th scope="col" className="px-5 py-3 text-right font-medium">Demandas</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ unidade: u, nivel }) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2" style={{ paddingLeft: `${nivel * 1.25}rem` }}>
                        {nivel > 0 && <CornerDownRight aria-hidden="true" className="size-3.5 text-muted-foreground" />}
                        {u.sigla && <span className="font-mono text-xs font-semibold text-primary">{u.sigla}</span>}
                        <span>{u.nome}</span>
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline">{TIPO_UNIDADE[u.tipo]}</Badge>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{u.responsavelNome ?? "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{u._count.demandas}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-muted-foreground">
                      Nenhuma unidade cadastrada.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {ctx.perfil === "CONTROLADOR" && (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Nova unidade</CardTitle>
              <CardDescription>Cadastre secretarias, departamentos e setores.</CardDescription>
            </CardHeader>
            <CardContent>
              <FormUnidade unidades={unidades.map(({ id, nome, sigla }) => ({ id, nome, sigla }))} />
            </CardContent>
          </Card>
        )}
      </div>
    </>
  );
}
