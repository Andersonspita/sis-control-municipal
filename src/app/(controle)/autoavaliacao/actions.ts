"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, db } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { hojeComoDataSimples } from "@/lib/datas";
import { requisitosDoCiclo } from "@/lib/dados/autoavaliacao";
import { validarResposta } from "@/lib/dados/conformidade";
import { gerarPlanoDoCiclo } from "@/lib/dados/gerar-plano";

const esquemaCiclo = z.object({
  nome: z.string().trim().min(3, { error: "Informe o nome do ciclo." }).max(160),
  normaIds: z.array(z.uuid()).min(1, { error: "Escolha ao menos uma norma." }),
  unidadeId: z.union([z.uuid(), z.literal("")]).optional().transform((v) => v || null),
  dataInicio: z.iso.date({ error: "Data de início inválida." }),
});

export type EstadoCiclo = { erro?: string } | undefined;

/** Abre um ciclo por norma escolhida, com as respostas dos requisitos avaliáveis aplicáveis ao cliente. */
export async function abrirCiclo(_: EstadoCiclo, formData: FormData): Promise<EstadoCiclo> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaCiclo.safeParse({
    nome: formData.get("nome"),
    normaIds: formData.getAll("normaId"),
    unidadeId: formData.get("unidadeId") ?? "",
    dataInicio: formData.get("dataInicio"),
  });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const { nome, normaIds, unidadeId, dataInicio } = dados.data;

  const normas = await db.norma.findMany({
    where: { id: { in: normaIds }, ativo: true },
    select: { id: true, codigo: true },
  });
  if (normas.length !== normaIds.length) return { erro: "Norma não encontrada." };

  const requisitosPorNorma = new Map<string, string[]>();
  for (const n of normas) {
    const reqs = await requisitosDoCiclo(n.id, ctx.cliente.tipo);
    if (!reqs.length) return { erro: `A norma ${n.codigo} não tem requisitos aplicáveis a este tipo de entidade.` };
    requisitosPorNorma.set(n.id, reqs.map((r) => r.id));
  }

  let resultado: { erro: string } | { ids: string[] };
  try {
    resultado = await comCliente(
      ctx,
      async (tx) => {
        if (unidadeId) {
          const unidade = await tx.unidade.findUnique({ where: { id: unidadeId }, select: { id: true } });
          if (!unidade) return { erro: "Unidade não encontrada." };
        }
        const abertos = await tx.cicloAvaliacao.findMany({
          where: { normaId: { in: normaIds }, unidadeId, status: "EM_ANDAMENTO" },
          select: { norma: { select: { codigo: true } } },
        });
        if (abertos.length) {
          return {
            erro: `Já existe ciclo em andamento com este alcance para: ${abertos.map((a) => a.norma.codigo).join(", ")}. Conclua-o antes de abrir outro.`,
          };
        }
        const ids: string[] = [];
        for (const n of normas) {
          const requisitos = requisitosPorNorma.get(n.id)!;
          const ciclo = await tx.cicloAvaliacao.create({
            data: {
              clienteId: ctx.clienteId,
              normaId: n.id,
              unidadeId,
              nome,
              dataInicio: new Date(dataInicio),
              criadoPorId: ctx.usuarioId,
            },
            select: { id: true },
          });
          await tx.respostaRequisito.createMany({
            data: requisitos.map((requisitoId) => ({ clienteId: ctx.clienteId, cicloId: ciclo.id, requisitoId })),
          });
          await registrarLog(tx, ctx.clienteId, {
            acao: "ciclo.aberto",
            usuarioId: ctx.usuarioId,
            entidade: "CicloAvaliacao",
            entidadeId: ciclo.id,
            dados: { nome, norma: n.codigo, unidadeId, requisitos: requisitos.length },
          });
          ids.push(ciclo.id);
        }
        return { ids };
      },
      { timeout: 30_000 },
    );
  } catch (err) {
    console.error(err);
    return { erro: "Não foi possível abrir o ciclo." };
  }
  if ("erro" in resultado) return resultado;

  revalidatePath("/autoavaliacao");
  revalidatePath("/painel");
  redirect(resultado.ids.length === 1 ? `/autoavaliacao/${resultado.ids[0]}` : "/autoavaliacao");
}

const esquemaResposta = z.object({
  respostaId: z.uuid(),
  situacao: z.enum(["NAO_AVALIADO", "ATENDIDO", "PARCIALMENTE_ATENDIDO", "NAO_ATENDIDO", "NAO_APLICAVEL"]),
  observacao: z.string().trim().max(4000).optional().transform((v) => v || null),
  evidencia: z.string().trim().max(4000).optional().transform((v) => v || null),
});

export type ResultadoResposta =
  | { ok: true; respondidoEm: string | null; respondidoPor: string | null }
  | { ok: false; erro: string };

function cicloFechado(err: unknown) {
  return err instanceof Error && /congeladas|encerrado/i.test(err.message);
}

export async function salvarResposta(entrada: z.input<typeof esquemaResposta>): Promise<ResultadoResposta> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaResposta.safeParse(entrada);
  if (!dados.success) return { ok: false, erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const { respostaId, situacao, observacao, evidencia } = dados.data;
  const erroValidacao = validarResposta(situacao, observacao);
  if (erroValidacao) return { ok: false, erro: erroValidacao };

  try {
    const r = await comCliente(ctx, async (tx) => {
      const atual = await tx.respostaRequisito.findUnique({
        where: { id: respostaId },
        select: {
          situacao: true,
          cicloId: true,
          ciclo: { select: { status: true } },
          requisito: { select: { codigo: true } },
        },
      });
      if (!atual) return { ok: false as const, erro: "Resposta não encontrada." };
      if (atual.ciclo.status !== "EM_ANDAMENTO") {
        return { ok: false as const, erro: "Ciclo encerrado: as respostas não podem mais ser alteradas." };
      }
      const avaliado = situacao !== "NAO_AVALIADO";
      const salvo = await tx.respostaRequisito.update({
        where: { id: respostaId },
        data: {
          situacao,
          observacao,
          evidencia,
          respondidoPorId: avaliado ? ctx.usuarioId : null,
          respondidoEm: avaliado ? new Date() : null,
        },
        select: { respondidoEm: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "resposta.salva",
        usuarioId: ctx.usuarioId,
        entidade: "RespostaRequisito",
        entidadeId: respostaId,
        dados: { cicloId: atual.cicloId, requisito: atual.requisito.codigo, de: atual.situacao, para: situacao },
      });
      return {
        ok: true as const,
        respondidoEm: salvo.respondidoEm?.toISOString() ?? null,
        respondidoPor: avaliado ? ctx.usuario.nome : null,
      };
    });
    return r;
  } catch (err) {
    if (cicloFechado(err)) return { ok: false, erro: "Ciclo encerrado: as respostas não podem mais ser alteradas." };
    console.error(err);
    return { ok: false, erro: "Não foi possível salvar a resposta." };
  }
}

export type ResultadoSimples = { ok: true; mensagem?: string } | { ok: false; erro: string };

export async function concluirCiclo(cicloId: string): Promise<ResultadoSimples> {
  const ctx = await exigirContexto(["CONTROLADOR"]);
  if (!z.uuid().safeParse(cicloId).success) return { ok: false, erro: "Ciclo inválido." };

  const r = await comCliente(ctx, async (tx) => {
    const ciclo = await tx.cicloAvaliacao.findUnique({
      where: { id: cicloId },
      select: { status: true, dataFim: true, nome: true, _count: { select: { respostas: { where: { situacao: "NAO_AVALIADO" } } } } },
    });
    if (!ciclo) return { ok: false as const, erro: "Ciclo não encontrado." };
    if (ciclo.status !== "EM_ANDAMENTO") return { ok: false as const, erro: "O ciclo já está encerrado." };
    await tx.cicloAvaliacao.update({
      where: { id: cicloId },
      data: {
        status: "CONCLUIDO",
        dataFim: ciclo.dataFim ?? hojeComoDataSimples(),
        concluidoEm: new Date(),
        concluidoPorId: ctx.usuarioId,
      },
    });
    await registrarLog(tx, ctx.clienteId, {
      acao: "ciclo.concluido",
      usuarioId: ctx.usuarioId,
      entidade: "CicloAvaliacao",
      entidadeId: cicloId,
      dados: { nome: ciclo.nome, naoAvaliados: ciclo._count.respostas },
    });
    return { ok: true as const, mensagem: "Ciclo concluído. As respostas foram congeladas." };
  });

  if (r.ok) {
    revalidatePath("/autoavaliacao");
    revalidatePath(`/autoavaliacao/${cicloId}`);
    revalidatePath("/painel");
  }
  return r;
}

export type ResultadoPlano = { ok: true; planoId: string | null; criadas: number } | { ok: false; erro: string };

export async function gerarPlano(cicloId: string): Promise<ResultadoPlano> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(cicloId).success) return { ok: false, erro: "Ciclo inválido." };

  try {
    const r = await comCliente(ctx, async (tx) => {
      const resultado = await gerarPlanoDoCiclo(tx, { clienteId: ctx.clienteId, cicloId, usuarioId: ctx.usuarioId });
      if (resultado.planoId && resultado.criadas > 0) {
        await registrarLog(tx, ctx.clienteId, {
          acao: resultado.planoNovo ? "plano.gerado" : "plano.acoes_adicionadas",
          usuarioId: ctx.usuarioId,
          entidade: "PlanoAcao",
          entidadeId: resultado.planoId,
          dados: { cicloId, acoesCriadas: resultado.criadas },
        });
      }
      return resultado;
    });
    revalidatePath("/planos");
    revalidatePath(`/autoavaliacao/${cicloId}`);
    revalidatePath("/painel");
    return { ok: true, planoId: r.planoId, criadas: r.criadas };
  } catch (err) {
    console.error(err);
    return { ok: false, erro: "Não foi possível gerar o plano de ação." };
  }
}
