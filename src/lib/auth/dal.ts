import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db, type ContextoCliente } from "@/lib/db";
import type { Perfil, TipoCliente } from "@/generated/prisma/client";
import { idSessaoDoCookie } from "./sessao";

export type UsuarioLogado = {
  id: string;
  nome: string;
  email: string;
  adminHorizon: boolean;
};

export type Contexto = ContextoCliente & {
  usuario: UsuarioLogado;
  cliente: { id: string; nome: string; tipo: TipoCliente; municipio: string; uf: string; tema: string };
  vinculoId: string;
};

export const obterSessao = cache(async () => {
  const id = await idSessaoDoCookie();
  if (!id) return null;
  const sessao = await db.sessao.findUnique({
    where: { id },
    select: {
      id: true,
      expiraEm: true,
      clienteAtivoId: true,
      municipioAcesso: { select: { id: true, slug: true, nome: true, uf: true, ativo: true } },
      usuario: { select: { id: true, nome: true, email: true, adminHorizon: true, ativo: true } },
    },
  });
  if (!sessao || sessao.expiraEm < new Date() || !sessao.usuario.ativo) return null;
  const { nome, email, adminHorizon } = sessao.usuario;
  const usuario: UsuarioLogado = { id: sessao.usuario.id, nome, email, adminHorizon };
  return { id: sessao.id, clienteAtivoId: sessao.clienteAtivoId, municipioAcesso: sessao.municipioAcesso, usuario };
});

type Sessao = NonNullable<Awaited<ReturnType<typeof obterSessao>>>;

/**
 * Sessão aberta pelo link do município só alcança as entidades dele.
 * Administradores HorizonAJ não ficam presos: a listagem é filtrada, mas a troca de entidade é livre.
 */
export function clientePermitidoNaSessao(sessao: Sessao, cliente: { municipioId: string | null }) {
  return !sessao.municipioAcesso || sessao.usuario.adminHorizon || cliente.municipioId === sessao.municipioAcesso.id;
}

export async function exigirUsuario() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

/** Vínculos ativos do usuário (clientes que ele pode acessar); na sessão restrita, só os do município. */
export const listarVinculos = cache(async (usuarioId: string) => {
  const sessao = await obterSessao();
  const municipioId = sessao?.usuario.id === usuarioId ? sessao.municipioAcesso?.id : undefined;
  return db.vinculoCliente.findMany({
    where: { usuarioId, ativo: true, cliente: { ativo: true, ...(municipioId && { municipioId }) } },
    select: {
      id: true,
      perfil: true,
      cargo: true,
      cliente: { select: { id: true, nome: true, tipo: true, municipio: true, uf: true } },
    },
    orderBy: [{ cliente: { municipio: "asc" } }, { cliente: { nome: "asc" } }],
  });
});

/** Se o usuário tem vínculo ativo em entidade de outro município. */
export async function temVinculosForaDoMunicipio(usuarioId: string, municipioId: string) {
  const n = await db.vinculoCliente.count({
    where: { usuarioId, ativo: true, cliente: { ativo: true, municipioId: { not: municipioId } } },
  });
  return n > 0;
}

export const obterContexto = cache(async (): Promise<Contexto | null> => {
  const sessao = await obterSessao();
  if (!sessao?.clienteAtivoId) return null;
  const vinculo = await db.vinculoCliente.findUnique({
    where: { usuarioId_clienteId: { usuarioId: sessao.usuario.id, clienteId: sessao.clienteAtivoId } },
    select: {
      id: true,
      perfil: true,
      ativo: true,
      cliente: {
        select: { id: true, nome: true, tipo: true, municipio: true, uf: true, tema: true, ativo: true, municipioId: true },
      },
    },
  });
  if (!vinculo?.ativo || !vinculo.cliente.ativo || !clientePermitidoNaSessao(sessao, vinculo.cliente)) return null;
  const { id, nome, tipo, municipio, uf, tema } = vinculo.cliente;
  const cliente = { id, nome, tipo, municipio, uf, tema };
  return {
    clienteId: cliente.id,
    usuarioId: sessao.usuario.id,
    perfil: vinculo.perfil,
    usuario: sessao.usuario,
    cliente,
    vinculoId: vinculo.id,
  };
});

export function paginaInicial(perfil: Perfil) {
  return perfil === "SATELITE" ? "/satelite" : "/painel";
}

/** Exige sessão e cliente ativo; opcionalmente restringe a perfis. */
export async function exigirContexto(perfis?: Perfil[]): Promise<Contexto> {
  await exigirUsuario();
  const ctx = await obterContexto();
  if (!ctx) redirect("/selecionar-cliente");
  if (perfis && !perfis.includes(ctx.perfil)) redirect(paginaInicial(ctx.perfil));
  return ctx;
}

export const PERFIS_CONTROLE: Perfil[] = ["CONTROLADOR", "EQUIPE"];
