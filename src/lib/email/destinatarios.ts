import type { Prisma } from "@/generated/prisma/client";

// Recebe a transação já com o contexto de cliente (perfil de controle) aplicado às políticas de RLS.
type Tx = Prisma.TransactionClient;

export type Destinatario = { email: string; nome: string };

const usuarioAtivo = { select: { usuario: { select: { email: true, nome: true } } } } as const;

/** Controladores e equipe ativos do cliente. */
export async function destinatariosControle(tx: Tx, clienteId: string): Promise<Destinatario[]> {
  const vinculos = await tx.vinculoCliente.findMany({
    where: { clienteId, ativo: true, perfil: { in: ["CONTROLADOR", "EQUIPE"] }, usuario: { ativo: true } },
    ...usuarioAtivo,
  });
  return unicos(vinculos.map((v) => v.usuario));
}

/**
 * Resolve, para qualquer unidade do cliente, os satélites ativos que a enxergam.
 * Um escopo numa unidade cobre também as subordinadas (mesma regra de `app_unidades_satelite`),
 * então a unidade recebe os satélites do seu escopo e dos escopos das unidades superiores.
 */
export async function resolvedorSatelites(tx: Tx): Promise<(unidadeId: string) => Destinatario[]> {
  const [unidades, escopos] = await Promise.all([
    tx.unidade.findMany({ select: { id: true, paiId: true } }),
    tx.escopoSatelite.findMany({
      where: { vinculo: { ativo: true, perfil: "SATELITE", usuario: { ativo: true } } },
      select: { unidadeId: true, vinculo: usuarioAtivo },
    }),
  ]);
  const pai = new Map(unidades.map((u) => [u.id, u.paiId]));
  const porUnidade = new Map<string, Destinatario[]>();
  for (const e of escopos) porUnidade.set(e.unidadeId, [...(porUnidade.get(e.unidadeId) ?? []), e.vinculo.usuario]);

  return (unidadeId) => {
    const encontrados: Destinatario[] = [];
    const visitadas = new Set<string>();
    for (let atual: string | null | undefined = unidadeId; atual && !visitadas.has(atual); atual = pai.get(atual)) {
      visitadas.add(atual);
      encontrados.push(...(porUnidade.get(atual) ?? []));
    }
    return unicos(encontrados);
  };
}

function unicos(lista: Destinatario[]) {
  const vistos = new Map<string, Destinatario>();
  for (const d of lista) vistos.set(d.email.toLowerCase(), d);
  return [...vistos.values()];
}
