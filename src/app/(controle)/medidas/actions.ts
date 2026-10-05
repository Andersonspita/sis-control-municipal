"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { exigirContexto, PERFIS_CONTROLE } from "@/lib/auth/dal";
import { comCliente, type Tx } from "@/lib/db";
import { registrarLog } from "@/lib/auditoria";
import { arquivosDoFormulario, comArquivos, registrarDocumentos } from "@/lib/documentos";
import { numeroSituacao } from "@/lib/dados/medidas";
import { ErroNegocio, mensagemDeErro } from "@/lib/erros";
import { classificarRisco } from "@/lib/risco";
import type { EstadoAcao } from "@/lib/acoes";
import { STATUS_ENCERRADOS } from "./filtros";

const textoOpcional = (max: number) =>
  z.string().trim().max(max).optional().transform((v) => v || null);
const escala = (rotulo: string) =>
  z.coerce
    .number({ error: `Informe ${rotulo} de 1 a 5.` })
    .int({ error: `Informe ${rotulo} de 1 a 5.` })
    .min(1, { error: `Informe ${rotulo} de 1 a 5.` })
    .max(5, { error: `Informe ${rotulo} de 1 a 5.` });

const esquemaSituacao = z
  .object({
    titulo: z.string().trim().min(5, { error: "Informe o título (mínimo de 5 caracteres)." }).max(200),
    descricao: z.string().trim().min(10, { error: "Descreva a situação (mínimo de 10 caracteres)." }).max(10000),
    origem: z.enum(["CONSTATACAO", "DENUNCIA", "ALERTA", "ANALISE_IA", "DEMANDA_EXTERNA"], { error: "Selecione a origem." }),
    unidadeId: z.union([z.uuid({ error: "Unidade inválida." }), z.literal("")]).optional().transform((v) => v || null),
    probabilidade: escala("a probabilidade"),
    impacto: escala("o impacto"),
    sigilosa: z.preprocess((v) => v === "on" || v === "1" || v === "true", z.boolean()),
    denunciante: textoOpcional(300),
  })
  // Sigilo e denunciante só existem para denúncia.
  .transform((d) => (d.origem === "DENUNCIA" ? d : { ...d, sigilosa: false, denunciante: null }));

type DadosSituacao = z.infer<typeof esquemaSituacao>;

async function conferirUnidade(tx: Tx, unidadeId: string | null) {
  if (!unidadeId) return null;
  const unidade = await tx.unidade.findUnique({ where: { id: unidadeId }, select: { nome: true } });
  if (!unidade) throw new ErroNegocio("Unidade envolvida não encontrada.");
  return unidade.nome;
}

function revalidarSituacao(id: string) {
  revalidatePath(`/medidas/${id}`);
  revalidatePath("/medidas");
}

export async function criarSituacao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaSituacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  let id: string;
  try {
    id = await comArquivos(ctx.clienteId, arquivosDoFormulario(formData), (salvos) =>
      comCliente(ctx, async (tx) => {
        const unidade = await conferirUnidade(tx, dados.data.unidadeId);
        const ano = Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric" }).format(new Date()));
        // Numeração sequencial por cliente e ano, serializada por trava transacional.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`situacao:${ctx.clienteId}:${ano}`}, 0))`;
        const ultima = await tx.situacao.aggregate({ where: { ano }, _max: { numero: true } });
        const numero = (ultima._max.numero ?? 0) + 1;

        const situacao = await tx.situacao.create({
          data: { ...dados.data, clienteId: ctx.clienteId, numero, ano, criadoPorId: ctx.usuarioId },
          select: { id: true },
        });
        await registrarDocumentos(tx, ctx, salvos, { situacaoId: situacao.id });
        // O denunciante nunca vai para a trilha.
        await registrarLog(tx, ctx.clienteId, {
          acao: "situacao.criada",
          usuarioId: ctx.usuarioId,
          entidade: "Situacao",
          entidadeId: situacao.id,
          dados: {
            numero: numeroSituacao(numero, ano),
            titulo: dados.data.titulo,
            origem: dados.data.origem,
            unidade,
            probabilidade: dados.data.probabilidade,
            impacto: dados.data.impacto,
            gravidade: classificarRisco(dados.data.probabilidade, dados.data.impacto),
            sigilosa: dados.data.sigilosa,
            anexos: salvos.length,
          },
        });
        return situacao.id;
      }),
    );
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidatePath("/medidas");
  redirect(`/medidas/${id}`);
}

const CAMPOS_COMPARADOS = ["titulo", "origem", "unidadeId", "probabilidade", "impacto", "sigilosa"] as const;

export async function editarSituacao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { erro: "Situação inválida." };
  const dados = esquemaSituacao.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message };
  const situacaoId = id.data;

  try {
    await comCliente(ctx, async (tx) => {
      const atual = await tx.situacao.findUnique({
        where: { id: situacaoId },
        select: {
          status: true,
          titulo: true,
          descricao: true,
          origem: true,
          unidadeId: true,
          probabilidade: true,
          impacto: true,
          sigilosa: true,
          denunciante: true,
        },
      });
      if (!atual) throw new ErroNegocio("Situação não encontrada.");
      if (STATUS_ENCERRADOS.includes(atual.status)) throw new ErroNegocio("Situação encerrada: reabra-a para editar.");
      await conferirUnidade(tx, dados.data.unidadeId);

      // Só o controlador vê o denunciante de uma denúncia sigilosa; os demais não alteram origem, sigilo nem denunciante.
      const preservarSigilo = atual.sigilosa && ctx.perfil !== "CONTROLADOR";
      const novo: DadosSituacao = preservarSigilo
        ? { ...dados.data, origem: atual.origem, sigilosa: true, denunciante: atual.denunciante }
        : dados.data;

      const alteracoes = Object.fromEntries(
        CAMPOS_COMPARADOS.filter((c) => atual[c] !== novo[c]).map((c) => [c, { de: atual[c], para: novo[c] }]),
      );
      const descricaoAlterada = atual.descricao !== novo.descricao;
      const denuncianteAlterado = (atual.denunciante ?? null) !== (novo.denunciante ?? null);
      if (!Object.keys(alteracoes).length && !descricaoAlterada && !denuncianteAlterado) return;

      await tx.situacao.update({ where: { id: situacaoId }, data: novo });
      await registrarLog(tx, ctx.clienteId, {
        acao: "situacao.atualizada",
        usuarioId: ctx.usuarioId,
        entidade: "Situacao",
        entidadeId: situacaoId,
        dados: {
          ...alteracoes,
          ...(descricaoAlterada && { descricaoAlterada: true }),
          ...(denuncianteAlterado && { denuncianteAlterado: true }),
          gravidade: {
            de: classificarRisco(atual.probabilidade, atual.impacto),
            para: classificarRisco(novo.probabilidade, novo.impacto),
          },
        },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarSituacao(situacaoId);
  return { ok: true, mensagem: "Situação atualizada." };
}

const esquemaStatus = z.object({
  situacaoId: z.uuid(),
  status: z.enum(["ABERTA", "EM_TRATAMENTO", "RESOLVIDA", "ARQUIVADA"], { error: "Situação inválida." }),
  justificativa: textoOpcional(5000),
});

export async function alterarStatusSituacao(_: EstadoAcao, formData: FormData): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  const dados = esquemaStatus.safeParse(Object.fromEntries(formData));
  if (!dados.success) return { erro: dados.error.issues[0]?.message ?? "Dados inválidos." };
  const { situacaoId, status, justificativa } = dados.data;
  const encerrando = STATUS_ENCERRADOS.includes(status);
  if (encerrando && (!justificativa || justificativa.length < 10)) {
    return { erro: "Justifique o encerramento (mínimo de 10 caracteres)." };
  }

  try {
    await comCliente(ctx, async (tx) => {
      const atual = await tx.situacao.findUnique({ where: { id: situacaoId }, select: { status: true } });
      if (!atual) throw new ErroNegocio("Situação não encontrada.");
      if (atual.status === status) throw new ErroNegocio("A situação já está nesse estado.");
      const reabrindo = STATUS_ENCERRADOS.includes(atual.status);
      if ((encerrando || reabrindo) && ctx.perfil !== "CONTROLADOR") {
        throw new ErroNegocio("Somente o controlador pode encerrar ou reabrir uma situação.");
      }
      await tx.situacao.update({
        where: { id: situacaoId },
        data: encerrando
          ? { status, encerradoPorId: ctx.usuarioId, encerradoEm: new Date(), justificativaEncerramento: justificativa }
          : { status, encerradoPorId: null, encerradoEm: null, justificativaEncerramento: null },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: encerrando ? "situacao.encerrada" : reabrindo ? "situacao.reaberta" : "situacao.status_alterado",
        usuarioId: ctx.usuarioId,
        entidade: "Situacao",
        entidadeId: situacaoId,
        dados: { de: atual.status, para: status, ...(justificativa && { justificativa }) },
      });
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }
  revalidarSituacao(situacaoId);
  return { ok: true, mensagem: encerrando ? "Situação encerrada." : "Situação atualizada." };
}

/** Cria o plano de ação geral da situação (motor 5W2H) ou abre o existente. */
export async function criarPlanoDaSituacao(situacaoId: string): Promise<EstadoAcao> {
  const ctx = await exigirContexto(PERFIS_CONTROLE);
  if (!z.uuid().safeParse(situacaoId).success) return { erro: "Situação inválida." };

  let planoId: string;
  try {
    planoId = await comCliente(ctx, async (tx) => {
      // Trava a linha para não criar dois planos em cliques simultâneos.
      const [situacao] = await tx.$queryRaw<{ numero: number; ano: number; titulo: string; status: string }[]>`
        SELECT numero, ano, titulo, status::text AS status FROM situacoes WHERE id = ${situacaoId}::uuid FOR UPDATE`;
      if (!situacao) throw new ErroNegocio("Situação não encontrada.");
      const existente = await tx.planoAcao.findUnique({ where: { situacaoId }, select: { id: true } });
      if (existente) return existente.id;
      if (situacao.status === "RESOLVIDA" || situacao.status === "ARQUIVADA") {
        throw new ErroNegocio("Situação encerrada: reabra-a para criar o plano de ação.");
      }

      const titulo = `Medida ${numeroSituacao(situacao.numero, situacao.ano)} — ${situacao.titulo}`.slice(0, 200);
      const plano = await tx.planoAcao.create({
        data: {
          clienteId: ctx.clienteId,
          situacaoId,
          titulo,
          origem: "MEDIDA",
          status: "EM_EXECUCAO",
          criadoPorId: ctx.usuarioId,
        },
        select: { id: true },
      });
      await registrarLog(tx, ctx.clienteId, {
        acao: "plano.criado",
        usuarioId: ctx.usuarioId,
        entidade: "PlanoAcao",
        entidadeId: plano.id,
        dados: { titulo, origem: "MEDIDA", situacaoId },
      });
      if (situacao.status === "ABERTA") {
        await tx.situacao.update({ where: { id: situacaoId }, data: { status: "EM_TRATAMENTO" } });
        await registrarLog(tx, ctx.clienteId, {
          acao: "situacao.status_alterado",
          usuarioId: ctx.usuarioId,
          entidade: "Situacao",
          entidadeId: situacaoId,
          dados: { de: "ABERTA", para: "EM_TRATAMENTO", motivo: "Plano de ação criado" },
        });
      }
      return plano.id;
    });
  } catch (err) {
    return { erro: mensagemDeErro(err) };
  }

  revalidarSituacao(situacaoId);
  revalidatePath("/planos");
  redirect(`/planos/${planoId}`);
}
