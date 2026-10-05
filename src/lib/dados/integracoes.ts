import "server-only";
import { after } from "next/server";
import { comCliente, db, type ContextoCliente } from "@/lib/db";
import type { ColetaIntegracao, FonteIntegracao } from "@/generated/prisma/client";
import {
  executarSincronizacao,
  iniciarSincronizacao,
  PROCESSAMENTO_EXPIRA_MS,
  type ClienteIntegracao,
} from "@/lib/integracoes/sincronizar";
import type { DadosIbge, DadosPortalTransparencia, DadosSiconfi } from "@/lib/integracoes/tipos";

export type Coleta<T> = Omit<ColetaIntegracao, "dados"> & { dados: T | null; travada: boolean };

export type DadosExternos = {
  cliente: ClienteIntegracao & { nome: string; uf: string; populacao: number | null };
  ibge: Coleta<DadosIbge> | null;
  siconfi: Coleta<DadosSiconfi> | null;
  portal: Coleta<DadosPortalTransparencia> | null;
  processando: boolean;
};

export async function carregarDadosExternos(ctx: ContextoCliente): Promise<DadosExternos> {
  const [cliente, coletas] = await Promise.all([
    db.cliente.findUniqueOrThrow({
      where: { id: ctx.clienteId },
      select: { id: true, nome: true, tipo: true, cnpj: true, municipio: true, uf: true, codigoIbge: true, populacao: true },
    }),
    comCliente(ctx, (tx) => tx.coletaIntegracao.findMany()),
  ]);
  const limite = Date.now() - PROCESSAMENTO_EXPIRA_MS;
  const por = <T>(fonte: FonteIntegracao): Coleta<T> | null => {
    const c = coletas.find((x) => x.fonte === fonte);
    if (!c) return null;
    // Processamento interrompido (ex.: reinício do servidor): exibido como erro, pode ser refeito.
    const travada = c.status === "PROCESSANDO" && c.iniciadoEm.getTime() < limite;
    return { ...c, dados: (c.dados as T | null) ?? null, travada };
  };
  const ibge = por<DadosIbge>("IBGE");
  const siconfi = por<DadosSiconfi>("SICONFI");
  const portal = por<DadosPortalTransparencia>("PORTAL_TRANSPARENCIA");
  const processando = [ibge, siconfi, portal].some((c) => c?.status === "PROCESSANDO" && !c.travada);
  return { cliente, ibge, siconfi, portal, processando };
}

/**
 * Marca as fontes como em processamento e agenda a coleta para depois da resposta.
 * Devolve false se já houver sincronização em andamento.
 */
export async function agendarSincronizacao(ctx: ContextoCliente, origem: "MANUAL" | "CADASTRO"): Promise<boolean> {
  const cliente = await db.cliente.findUniqueOrThrow({
    where: { id: ctx.clienteId },
    select: { id: true, tipo: true, cnpj: true, municipio: true, codigoIbge: true },
  });
  const iniciou = await comCliente(ctx, (tx) => iniciarSincronizacao(tx, ctx.clienteId, ctx.usuarioId));
  if (!iniciou) return false;
  const contexto: ContextoCliente = { clienteId: ctx.clienteId, usuarioId: ctx.usuarioId, perfil: ctx.perfil };
  after(async () => {
    try {
      await executarSincronizacao({
        cliente,
        usuarioId: ctx.usuarioId,
        origem,
        executar: (fn) => comCliente(contexto, fn, { timeout: 30_000 }),
      });
    } catch (err) {
      console.error("[integracoes] falha na sincronização", ctx.clienteId, err);
    }
  });
  return true;
}
