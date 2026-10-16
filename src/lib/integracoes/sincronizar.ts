import type { FonteIntegracao, Prisma, StatusColeta, TipoCliente } from "../../generated/prisma/client";
import { mensagemIntegracao, type Buscador } from "./http";
import { coletarIbge } from "./ibge";
import { poderDaEntidade } from "./lrf";
import { chavePortal, coletarPortalTransparencia, MENSAGEM_SEM_CHAVE } from "./portal-transparencia";
import { coletarSiconfi, hojeNaBahia } from "./siconfi";
import { aplicarAlertasAutomaticos, type ResultadoAlertasAutomaticos } from "./alertas-automaticos";
import type { DadosSiconfi } from "./tipos";
import { mensagensAlertasAutomaticos } from "../email/alertas";
import { enviarEmails } from "../email/transporte";

// Sincronização das fontes públicas de um cliente. Sem "server-only": roda na server action (via after())
// e no script de cron (scripts/sincronizar-integracoes.ts), cada um com sua conexão e contexto de RLS.

type Tx = Prisma.TransactionClient;
/** Executa `fn` numa transação com o contexto de RLS do cliente (comCliente da aplicação ou do script). */
export type ExecutorCliente = <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;

export type ClienteIntegracao = {
  id: string;
  nome: string;
  tipo: TipoCliente;
  cnpj: string;
  municipio: string;
  codigoIbge: string | null;
};

export const FONTES: FonteIntegracao[] = ["IBGE", "SICONFI", "PORTAL_TRANSPARENCIA"];

export const ROTULO_FONTE: Record<FonteIntegracao, string> = {
  IBGE: "IBGE",
  SICONFI: "SICONFI (Tesouro Nacional)",
  PORTAL_TRANSPARENCIA: "Portal da Transparência (CGU)",
};

/** Coleta presa em PROCESSANDO há mais que isso (ex.: servidor reiniciado) pode ser refeita. */
export const PROCESSAMENTO_EXPIRA_MS = 10 * 60 * 1000;

export const ACAO_LOG = "integracoes.sincronizadas";

/**
 * Marca as fontes do cliente como em processamento (mantendo os dados anteriores até a nova coleta).
 * Devolve false se já houver uma sincronização em andamento.
 */
export async function iniciarSincronizacao(tx: Tx, clienteId: string, usuarioId: string | null): Promise<boolean> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`integracoes:${clienteId}`}, 0))`;
  const emAndamento = await tx.coletaIntegracao.findFirst({
    where: { status: "PROCESSANDO", iniciadoEm: { gt: new Date(Date.now() - PROCESSAMENTO_EXPIRA_MS) } },
    select: { id: true },
  });
  if (emAndamento) return false;
  const agora = new Date();
  for (const fonte of FONTES) {
    await tx.coletaIntegracao.upsert({
      where: { clienteId_fonte: { clienteId, fonte } },
      create: { clienteId, fonte, status: "PROCESSANDO", solicitadoPorId: usuarioId, iniciadoEm: agora },
      update: { status: "PROCESSANDO", solicitadoPorId: usuarioId, iniciadoEm: agora, erro: null },
    });
  }
  return true;
}

type Resultado = { status: StatusColeta; referencia?: string | null; dados?: Prisma.InputJsonValue; erro?: string | null };

async function coletarFonte(fonte: FonteIntegracao, cliente: ClienteIntegracao, hoje: string, buscador?: Buscador): Promise<Resultado> {
  const codigo = cliente.codigoIbge;
  if (!codigo) return { status: "DESABILITADA", erro: "Cliente sem código IBGE cadastrado (peça ao administrador para preenchê-lo)." };

  if (fonte === "IBGE") {
    const dados = await coletarIbge(codigo, buscador);
    if (!dados) return { status: "SEM_DADOS", erro: `O IBGE não reconhece o código ${codigo}.` };
    const referencia = dados.anoPopulacao
      ? `População ${dados.tipoPopulacao === "CENSO" ? "do Censo" : "estimada"} ${dados.anoPopulacao}`
      : "Localidade";
    return { status: "SUCESSO", referencia, dados };
  }

  if (fonte === "SICONFI") {
    const dados = await coletarSiconfi(codigo, poderDaEntidade(cliente.tipo), { hoje, buscador });
    if (!dados) return { status: "SEM_DADOS", erro: "Nenhuma entrega do ente no SICONFI no exercício atual nem no anterior." };
    return { status: "SUCESSO", referencia: dados.pessoal?.referencia ?? dados.rcl?.referencia ?? `Exercício ${dados.exercicio}`, dados };
  }

  const chave = chavePortal();
  if (!chave) return { status: "DESABILITADA", erro: MENSAGEM_SEM_CHAVE };
  const dados = await coletarPortalTransparencia({ cnpj: cliente.cnpj, codigoIbge: codigo }, { chave, hoje, buscador });
  const vazio = !dados.recursos.registros && !dados.convenios.encontrados;
  return {
    status: vazio ? "SEM_DADOS" : "SUCESSO",
    referencia: `01 a ${String(dados.mesFim).padStart(2, "0")}/${dados.ano}`,
    dados,
    erro: vazio ? "Nenhum recurso federal recebido pelo CNPJ nem convênio do município encontrado." : null,
  };
}

export type ResumoSincronizacao = Record<FonteIntegracao, { status: StatusColeta; erro?: string | null }>;

export type ResultadoSincronizacao = {
  fontes: ResumoSincronizacao;
  /** Alertas criados, atualizados e encerrados automaticamente (null se o SICONFI não foi coletado). */
  alertas: ResultadoAlertasAutomaticos | null;
};

/**
 * Coleta cada fonte, grava o resultado assim que fica pronto, gera os alertas automáticos a partir do SICONFI,
 * avisa os controladores por e-mail e registra a sincronização na trilha.
 */
export async function executarSincronizacao(opcoes: {
  cliente: ClienteIntegracao;
  executar: ExecutorCliente;
  usuarioId: string | null;
  origem: "MANUAL" | "AGENDADA" | "CADASTRO" | "AUTOMATICA";
  hoje?: string;
  buscador?: Buscador;
  /** false: não envia e-mail dos alertas automáticos (testes). */
  notificar?: boolean;
}): Promise<ResultadoSincronizacao> {
  const { cliente, executar, usuarioId } = opcoes;
  const hoje = opcoes.hoje ?? hojeNaBahia();
  const resumo = {} as ResumoSincronizacao;
  let alertas: ResultadoAlertasAutomaticos | null = null;

  for (const fonte of FONTES) {
    let r: Resultado;
    try {
      r = await coletarFonte(fonte, cliente, hoje, opcoes.buscador);
    } catch (err) {
      r = { status: "ERRO", erro: mensagemIntegracao(err) };
    }
    resumo[fonte] = { status: r.status, erro: r.erro ?? null };
    const agora = new Date();
    // Em erro, os dados da coleta anterior continuam valendo (com a data em que foram coletados).
    const gravar =
      r.status === "ERRO"
        ? { status: r.status, erro: r.erro ?? null }
        : { status: r.status, erro: r.erro ?? null, referencia: r.referencia ?? null, dados: r.dados ?? undefined, coletadoEm: agora };
    await executar(async (tx) => {
      await tx.coletaIntegracao.upsert({
        where: { clienteId_fonte: { clienteId: cliente.id, fonte } },
        create: { clienteId: cliente.id, fonte, solicitadoPorId: usuarioId, ...gravar },
        update: gravar,
      });
      if (fonte === "IBGE" && r.status === "SUCESSO") {
        const populacao = (r.dados as { populacao?: number | null } | undefined)?.populacao;
        if (populacao) await tx.cliente.update({ where: { id: cliente.id }, data: { populacao } });
      }
    });

    if (fonte === "SICONFI" && r.status === "SUCESSO" && r.dados) {
      // Falha nos alertas não desfaz a coleta já gravada; a próxima coleta tenta de novo.
      try {
        alertas = await executar((tx) =>
          aplicarAlertasAutomaticos(tx, {
            clienteId: cliente.id,
            entidade: cliente.nome,
            poder: poderDaEntidade(cliente.tipo),
            dados: r.dados as unknown as DadosSiconfi,
            usuarioId,
          }),
        );
      } catch (err) {
        console.error("[integracoes] falha ao aplicar alertas automáticos", cliente.id, err);
      }
    }
  }

  if (alertas && opcoes.notificar !== false && (alertas.criados.length || alertas.encerrados.length)) {
    const gerados = alertas;
    try {
      const mensagens = await executar((tx) => mensagensAlertasAutomaticos(tx, cliente.id, cliente.nome, gerados));
      await enviarEmails(mensagens);
    } catch (err) {
      console.error("[integracoes] falha ao avisar alertas automáticos por e-mail", cliente.id, err);
    }
  }

  await executar((tx) =>
    // createMany: a política de leitura da trilha não deixa o INSERT ... RETURNING do create passar.
    tx.logAuditoria.createMany({
      data: [
        {
          clienteId: cliente.id,
          usuarioId,
          acao: ACAO_LOG,
          entidade: "ColetaIntegracao",
          dados: {
            origem: opcoes.origem,
            codigoIbge: cliente.codigoIbge,
            fontes: resumo,
            ...(alertas && {
              alertas: { criados: alertas.criados.length, atualizados: alertas.atualizados.length, encerrados: alertas.encerrados.length },
            }),
          },
        },
      ],
    }),
  );
  return { fontes: resumo, alertas };
}
