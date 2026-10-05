/**
 * Popula um cliente com dados de demonstração realistas de um município pequeno da Bahia:
 * Catolândia/BA, o menos populoso do estado no Censo 2022 (3.434 habitantes).
 *
 * Dados reais (públicos) usados:
 * - Código IBGE 2907400 e população do Censo 2022:
 *   https://servicodados.ibge.gov.br/api/v1/localidades/municipios/2907400
 *   https://servicodados.ibge.gov.br/api/v3/agregados/4709/periodos/2022/variaveis/93?localidades=N6[2907400]
 *   https://g1.globo.com/ba/bahia/noticia/2023/06/28/censo-2022-bahia-mantem-4a-maior-populacao-do-pais-mas-cresce-abaixo-da-media-nacional.ghtml
 * - CNPJ da Prefeitura (13.654.447/0001-26) e da Câmara (16.446.890/0001-08), Receita Federal:
 *   https://monitorcnpj.com.br/cnpj/13654447000126/
 *   https://monitorcnpj.com.br/cnpj/16446890000108/
 * - Estrutura administrativa (secretarias da LC nº 099/2025 e diretorias da LC nº 001/2022):
 *   https://portaldatransparencia.catolandia.ba.gov.br/organograma/
 *   https://catolandia.ba.gov.br/secretarias/
 *   https://catolandia.mtransparente.com.br/admin/data/PRESTACAODECONTAS180925093608.pdf
 *
 * Todo o resto é fictício: pessoas, e-mails (domínio .invalid, que nunca entrega), demandas,
 * achados, percentuais e valores. Não cria análises de IA nem arquivos no storage.
 *
 * Idempotente: cada item tem chave natural (CNPJ, sigla, e-mail, título/assunto); rodar de novo
 * só cria o que falta. Usuários já existentes mantêm a senha atual.
 *
 * Uso:
 *   npm run demo:popular -- --senha '...' [--cliente <id|nome|cnpj>] [--camara] [--vincular email]
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { hash } from "@node-rs/argon2";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type OrigemPlano,
  type OrigemSituacao,
  type Perfil,
  type Prioridade,
  type Prisma,
  type ResultadoItemChecklist,
  type SituacaoRequisito,
  type StatusAcao,
  type StatusAuditoria,
  type StatusDemanda,
  type StatusPlano,
  type TipoAuditoria,
  type TipoCliente,
  type TipoTramite,
  type TipoUnidade,
} from "../src/generated/prisma/client";
import { criarModelosBase } from "../src/lib/auditorias-modelos";

const { values } = parseArgs({
  options: {
    senha: { type: "string" },
    cliente: { type: "string" },
    camara: { type: "boolean", default: false },
    vincular: { type: "string" },
  },
});

type Tx = Prisma.TransactionClient;

// ───────────────────────── Datas ─────────────────────────

const AGORA = new Date();
const fmtBahia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia" });
const HOJE = new Date(`${fmtBahia.format(AGORA)}T00:00:00Z`);
const ANO = HOJE.getUTCFullYear();
const DIA = 86_400_000;

/** Data simples (coluna DATE) a `n` dias de hoje. */
const dia = (n: number) => new Date(HOJE.getTime() + n * DIA);
/** Instante no dia relativo `n`, na hora local da Bahia (UTC−3); nunca no futuro. */
const momento = (n: number, hora = 10) => new Date(Math.min(HOJE.getTime() + n * DIA + (hora + 3) * 3_600_000, AGORA.getTime() - 60_000));
/** Data simples no exercício corrente. */
const dataAno = (mes: number, d: number) => new Date(Date.UTC(ANO, mes - 1, d));
/** Instante no exercício corrente; nunca no futuro. */
const instanteAno = (mes: number, d: number, hora = 10) => new Date(Math.min(Date.UTC(ANO, mes - 1, d, hora + 3), AGORA.getTime() - 60_000));
const anoBahia = (d: Date) => Number(fmtBahia.format(d).slice(0, 4));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (n: number, ano: number) => `${String(n).padStart(3, "0")}/${ano}`;

/** Sorteio determinístico em [0, 1) (FNV-1a + finalizador do MurmurHash3): a mesma chave sempre dá o mesmo resultado. */
function sorteio(chave: string) {
  let h = 0x811c9dc5;
  for (const c of chave) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 2 ** 32;
}
const escolher = <T>(chave: string, opcoes: readonly T[]) => opcoes[Math.floor(sorteio(chave) * opcoes.length)];

// ───────────────────────── Modelos de cliente ─────────────────────────

type UnidadeDemo = { sigla: string; nome: string; tipo: TipoUnidade; pai?: string };
type PessoaDemo = { nome: string; login: string; cargo: string };
type Modelo = {
  unidades: UnidadeDemo[];
  /** Sigla canônica usada nos cenários (estrutura da prefeitura) → sigla deste modelo. */
  alias: Record<string, string>;
  controlador: PessoaDemo;
  equipe: PessoaDemo[];
  satelites: (PessoaDemo & { unidade: string })[];
};

const PREFEITURA: Modelo = {
  unidades: [
    { sigla: "GAB", nome: "Gabinete do Prefeito", tipo: "ORGAO" },
    { sigla: "PGM", nome: "Procuradoria Geral do Município", tipo: "ORGAO" },
    { sigla: "CGM", nome: "Controladoria Geral do Município", tipo: "ORGAO" },
    { sigla: "SEMAP", nome: "Secretaria Municipal de Administração e Planejamento", tipo: "SECRETARIA" },
    { sigla: "SEMAP-ADM", nome: "Diretoria Administrativa", tipo: "DEPARTAMENTO", pai: "SEMAP" },
    { sigla: "SEMAP-RH", nome: "Diretoria de Recursos Humanos", tipo: "DEPARTAMENTO", pai: "SEMAP" },
    { sigla: "SEMAP-COMP", nome: "Diretoria de Compras e Materiais", tipo: "DEPARTAMENTO", pai: "SEMAP" },
    { sigla: "SEMAP-PAT", nome: "Diretoria de Patrimônio", tipo: "DEPARTAMENTO", pai: "SEMAP" },
    { sigla: "SEMAP-LIC", nome: "Diretoria de Licitação", tipo: "DEPARTAMENTO", pai: "SEMAP" },
    { sigla: "SEFIN", nome: "Secretaria Municipal de Finanças", tipo: "SECRETARIA" },
    { sigla: "SEFIN-TRIB", nome: "Diretoria de Tributos", tipo: "DEPARTAMENTO", pai: "SEFIN" },
    { sigla: "SEFIN-CONT", nome: "Diretoria de Contabilidade e Orçamento", tipo: "DEPARTAMENTO", pai: "SEFIN" },
    { sigla: "SEINFRA", nome: "Secretaria Municipal de Infraestrutura, Obras e Serviços Públicos", tipo: "SECRETARIA" },
    { sigla: "SEINFRA-OBRAS", nome: "Diretoria de Obras e Serviços Públicos", tipo: "DEPARTAMENTO", pai: "SEINFRA" },
    { sigla: "SEINFRA-FISC", nome: "Diretoria de Licenciamento e Fiscalização", tipo: "DEPARTAMENTO", pai: "SEINFRA" },
    { sigla: "SEINFRA-TRANSP", nome: "Diretoria de Transporte", tipo: "DEPARTAMENTO", pai: "SEINFRA" },
    { sigla: "SEDUC", nome: "Secretaria Municipal de Educação, Cultura, Esporte e Lazer", tipo: "SECRETARIA" },
    { sigla: "SEDUC-ALIM", nome: "Setor de Alimentação Escolar", tipo: "SETOR", pai: "SEDUC" },
    { sigla: "SEDUC-TRANSP", nome: "Setor de Transporte Escolar", tipo: "SETOR", pai: "SEDUC" },
    { sigla: "SESAU", nome: "Secretaria Municipal de Saúde", tipo: "SECRETARIA" },
    { sigla: "SESAU-AB", nome: "Diretoria de Atenção Básica", tipo: "DEPARTAMENTO", pai: "SESAU" },
    { sigla: "SESAU-VIG", nome: "Diretoria de Vigilância Sanitária e Epidemiológica", tipo: "DEPARTAMENTO", pai: "SESAU" },
    { sigla: "SEMAS", nome: "Secretaria Municipal de Assistência Social", tipo: "SECRETARIA" },
    { sigla: "SEMAS-SUAS", nome: "Diretoria de Gestão do SUAS", tipo: "DEPARTAMENTO", pai: "SEMAS" },
    { sigla: "SEMAS-PSB", nome: "Diretoria de Proteção Social Básica", tipo: "DEPARTAMENTO", pai: "SEMAS" },
  ],
  alias: {},
  controlador: { nome: "Helena Prado Valadares", login: "helena.valadares", cargo: "Controladora-Geral do Município" },
  equipe: [
    { nome: "Marcos Vinícius Teles", login: "marcos.teles", cargo: "Auditor de Controle Interno" },
    { nome: "Lívia Barreto Queiroz", login: "livia.queiroz", cargo: "Assistente de Controle Interno" },
  ],
  satelites: [
    { nome: "Otávio Mendes Carvalhal", login: "otavio.carvalhal", cargo: "Diretor Administrativo", unidade: "SEMAP" },
    { nome: "Renata Siqueira Lobo", login: "renata.lobo", cargo: "Diretora de Contabilidade e Orçamento", unidade: "SEFIN" },
    { nome: "Caio Brandão Ferraz", login: "caio.ferraz", cargo: "Diretor de Obras e Serviços Públicos", unidade: "SEINFRA" },
    { nome: "Patrícia Nogueira Amaral", login: "patricia.amaral", cargo: "Coordenadora Administrativa da Educação", unidade: "SEDUC" },
    { nome: "Diego Fontes Rangel", login: "diego.rangel", cargo: "Coordenador de Regulação, Controle e Avaliação", unidade: "SESAU" },
    { nome: "Juliana Pacheco Dias", login: "juliana.dias", cargo: "Gestora de Fundos da Assistência Social", unidade: "SEMAS" },
  ],
};

const CAMARA: Modelo = {
  unidades: [
    { sigla: "CM-PRES", nome: "Presidência da Câmara", tipo: "ORGAO" },
    { sigla: "CM-CI", nome: "Controle Interno", tipo: "ORGAO" },
    { sigla: "CM-ADM", nome: "Diretoria Administrativa", tipo: "DEPARTAMENTO" },
    { sigla: "CM-RH", nome: "Setor de Pessoal", tipo: "SETOR", pai: "CM-ADM" },
    { sigla: "CM-LIC", nome: "Setor de Licitações e Contratos", tipo: "SETOR", pai: "CM-ADM" },
    { sigla: "CM-CONT", nome: "Setor de Contabilidade e Finanças", tipo: "SETOR" },
  ],
  alias: {
    GAB: "CM-PRES",
    CGM: "CM-CI",
    SEMAP: "CM-ADM",
    "SEMAP-ADM": "CM-ADM",
    "SEMAP-PAT": "CM-ADM",
    "SEMAP-COMP": "CM-LIC",
    "SEMAP-RH": "CM-RH",
    "SEMAP-LIC": "CM-LIC",
    SEFIN: "CM-CONT",
    "SEFIN-CONT": "CM-CONT",
  },
  controlador: { nome: "Sérgio Albuquerque Neves", login: "sergio.neves", cargo: "Controlador Interno da Câmara" },
  equipe: [],
  satelites: [
    { nome: "Beatriz Lacerda Moura", login: "beatriz.moura", cargo: "Diretora Administrativa", unidade: "CM-ADM" },
    { nome: "Fábio Rezende Cunha", login: "fabio.cunha", cargo: "Contador", unidade: "CM-CONT" },
  ],
};

const CATOLANDIA = { municipio: "Catolândia", uf: "BA", codigoIbge: "2907400", populacao: 3434 };
const CLIENTES_REAIS: Record<"PREFEITURA" | "CAMARA", { nome: string; cnpj: string }> = {
  PREFEITURA: { nome: "Prefeitura Municipal de Catolândia", cnpj: "13654447000126" },
  CAMARA: { nome: "Câmara Municipal de Catolândia", cnpj: "16446890000108" },
};

// ───────────────────────── Contexto de execução ─────────────────────────

type ClienteAlvo = { id: string; nome: string; tipo: TipoCliente; municipio: string; uf: string };
type Pessoa = { id: string; nome: string; email: string; perfil: Perfil; cargo: string; nova: boolean };
type UnidadeCriada = { id: string; nome: string; sigla: string; pai?: string };
type Log = { acao: string; usuarioId: string | null; entidade?: string; entidadeId?: string; dados?: Prisma.InputJsonValue; criadoEm: Date };

type Ctx = {
  tx: Tx;
  cliente: ClienteAlvo;
  modelo: Modelo;
  unidades: Map<string, UnidadeCriada>;
  controlador: Pessoa;
  equipe: Pessoa[];
  satelites: Map<string, Pessoa>;
  pessoas: Pessoa[];
  logs: Log[];
  criados: Record<string, number>;
};

function contar(ctx: Ctx, chave: string, n = 1) {
  ctx.criados[chave] = (ctx.criados[chave] ?? 0) + n;
}

function log(ctx: Ctx, entrada: Log) {
  ctx.logs.push(entrada);
}

/** Unidade pela sigla canônica (estrutura da prefeitura); undefined se o modelo não a tem. */
function unidade(ctx: Ctx, sigla: string | undefined) {
  if (!sigla) return undefined;
  return ctx.unidades.get(ctx.modelo.alias[sigla] ?? sigla);
}

/** Satélite responsável pela unidade (sobe a hierarquia); na falta, a controladoria responde. */
function responsavel(ctx: Ctx, u: UnidadeCriada): Pessoa {
  let atual: UnidadeCriada | undefined = u;
  while (atual) {
    const s = ctx.satelites.get(atual.sigla);
    if (s) return s;
    atual = atual.pai ? ctx.unidades.get(atual.pai) : undefined;
  }
  return ctx.controlador;
}

const equipe = (ctx: Ctx, i = 0) => ctx.equipe[i % Math.max(ctx.equipe.length, 1)] ?? ctx.controlador;

// ───────────────────────── Estrutura e usuários ─────────────────────────

function slug(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function criarUnidades(ctx: Ctx) {
  const { tx, cliente } = ctx;
  for (const u of ctx.modelo.unidades) {
    const pai = u.pai ? ctx.unidades.get(u.pai) : undefined;
    let registro = await tx.unidade.findFirst({ where: { clienteId: cliente.id, sigla: u.sigla }, select: { id: true, nome: true } });
    if (!registro) {
      const sat = ctx.modelo.satelites.find((s) => s.unidade === u.sigla);
      registro = await tx.unidade.create({
        data: {
          clienteId: cliente.id,
          paiId: pai?.id,
          nome: u.nome,
          sigla: u.sigla,
          tipo: u.tipo,
          responsavelNome: sat?.nome,
          responsavelEmail: sat ? emailDe(ctx, sat.login) : undefined,
          criadoEm: instanteAno(1, 12, 9),
        },
        select: { id: true, nome: true },
      });
      contar(ctx, "unidades");
      log(ctx, {
        acao: "unidade.criada",
        usuarioId: null,
        entidade: "Unidade",
        entidadeId: registro.id,
        dados: { nome: u.nome, sigla: u.sigla, origem: "demo:popular" },
        criadoEm: instanteAno(1, 12, 9),
      });
    }
    ctx.unidades.set(u.sigla, { id: registro.id, nome: registro.nome, sigla: u.sigla, pai: u.pai });
  }
}

function emailDe(ctx: Ctx, login: string) {
  const c = ctx.cliente;
  const dominio = c.tipo === "CAMARA" ? "leg.br" : "gov.br";
  return `${login}@demo.${slug(c.municipio)}.${c.uf.toLowerCase()}.${dominio}.invalid`;
}

async function criarPessoa(ctx: Ctx, p: PessoaDemo, perfil: Perfil, senhaHash: string, escopo?: string): Promise<Pessoa> {
  const { tx, cliente } = ctx;
  const email = emailDe(ctx, p.login);
  let usuario = await tx.usuario.findUnique({ where: { email }, select: { id: true, nome: true } });
  const nova = !usuario;
  if (!usuario) {
    usuario = await tx.usuario.create({ data: { email, nome: p.nome, senhaHash, criadoEm: instanteAno(1, 12, 10) }, select: { id: true, nome: true } });
    contar(ctx, "usuarios");
  }
  let vinculo = await tx.vinculoCliente.findUnique({
    where: { usuarioId_clienteId: { usuarioId: usuario.id, clienteId: cliente.id } },
    select: { id: true, perfil: true, cargo: true },
  });
  if (!vinculo) {
    vinculo = await tx.vinculoCliente.create({
      data: { usuarioId: usuario.id, clienteId: cliente.id, perfil, cargo: p.cargo },
      select: { id: true, perfil: true, cargo: true },
    });
    contar(ctx, "vinculos");
    log(ctx, {
      acao: "admin.vinculo.salvo",
      usuarioId: null,
      entidade: "VinculoCliente",
      entidadeId: vinculo.id,
      dados: { usuario: email, perfil, cargo: p.cargo, ...(escopo && { escopo }), origem: "demo:popular" },
      criadoEm: instanteAno(1, 12, 10),
    });
  }
  const u = escopo ? ctx.unidades.get(escopo) : undefined;
  if (u && vinculo.perfil === "SATELITE") {
    const existe = await tx.escopoSatelite.findUnique({ where: { vinculoId_unidadeId: { vinculoId: vinculo.id, unidadeId: u.id } }, select: { id: true } });
    if (!existe) await tx.escopoSatelite.create({ data: { clienteId: cliente.id, vinculoId: vinculo.id, unidadeId: u.id } });
  }
  return { id: usuario.id, nome: usuario.nome, email, perfil: vinculo.perfil, cargo: vinculo.cargo ?? p.cargo, nova };
}

async function criarEquipe(ctx: Ctx, senhaHash: string) {
  ctx.controlador = await criarPessoa(ctx, ctx.modelo.controlador, "CONTROLADOR", senhaHash);
  ctx.pessoas.push(ctx.controlador);
  for (const p of ctx.modelo.equipe) {
    const pessoa = await criarPessoa(ctx, p, "EQUIPE", senhaHash);
    ctx.equipe.push(pessoa);
    ctx.pessoas.push(pessoa);
  }
  for (const s of ctx.modelo.satelites) {
    const pessoa = await criarPessoa(ctx, s, "SATELITE", senhaHash, s.unidade);
    ctx.satelites.set(s.unidade, pessoa);
    ctx.pessoas.push(pessoa);
  }
}

// ───────────────────────── Autoavaliação ─────────────────────────

type RespostaDemo = { id: string; codigo: string; titulo: string; situacao: SituacaoRequisito };
type CicloDemo = { id: string; norma: string; respostas: RespostaDemo[] };

const OBSERVACOES: Record<Exclude<SituacaoRequisito, "NAO_AVALIADO">, string[]> = {
  ATENDIDO: [
    "Requisito atendido; evidência conferida pela equipe da Controladoria.",
    "Atendido. Ato normativo vigente e rotina executada com registro.",
    "Atendido conforme verificação documental e entrevista com o responsável.",
  ],
  PARCIALMENTE_ATENDIDO: [
    "Atendimento parcial: existe prática informal, sem normatização nem registro sistemático.",
    "Parcial: o procedimento existe, mas não alcança todas as unidades do Município.",
    "Parcial: norma publicada, porém sem evidência de execução periódica.",
  ],
  NAO_ATENDIDO: [
    "Não atendido: não foram localizados atos normativos ou registros que comprovem o requisito.",
    "Não atendido. A rotina não é executada; incluir no plano de ação.",
  ],
  NAO_APLICAVEL: ["Não se aplica à realidade do Município no exercício avaliado."],
};
const EVIDENCIAS = [
  "Documentação arquivada na Controladoria Geral (dados de demonstração).",
  "Publicação no Diário Oficial do Município (dados de demonstração).",
  "Relatório extraído do sistema de gestão (dados de demonstração).",
];
/** Respostas fixas, coerentes com a estrutura real: a Controladoria Geral existe por lei (LC 001/2022, art. 15, I, c). */
const RESPOSTAS_FIXAS: Record<string, { situacao: SituacaoRequisito; evidencia: string }> = {
  "OT05:I.1": { situacao: "ATENDIDO", evidencia: "Lei Complementar municipal nº 001/2022, art. 15, I, c, e LC nº 099/2025 (estrutura administrativa)." },
};
const TAXA_RESPOSTA: Record<string, number> = { OT05: 0.75 };

function situacaoDemo(chave: string, norma: string): SituacaoRequisito | null {
  if (RESPOSTAS_FIXAS[chave]) return RESPOSTAS_FIXAS[chave].situacao;
  if (sorteio(chave) >= (TAXA_RESPOSTA[norma] ?? 0.45)) return null;
  const s = sorteio(`situacao:${chave}`);
  return s < 0.42 ? "ATENDIDO" : s < 0.72 ? "PARCIALMENTE_ATENDIDO" : s < 0.93 ? "NAO_ATENDIDO" : "NAO_APLICAVEL";
}

async function autoavaliacao(ctx: Ctx): Promise<CicloDemo[]> {
  const { tx, cliente } = ctx;
  const normas = await tx.norma.findMany({ where: { ativo: true }, select: { id: true, codigo: true, titulo: true }, orderBy: { codigo: "asc" } });
  const inicio = new Date(Math.min(dataAno(1, 20).getTime(), HOJE.getTime()));
  const ciclos: CicloDemo[] = [];
  for (const norma of normas) {
    const requisitos = await tx.requisito.findMany({
      where: { normaId: norma.id, avaliavel: true, tiposEntidade: { has: cliente.tipo } },
      select: { id: true, codigo: true, titulo: true },
      orderBy: { ordem: "asc" },
    });
    if (!requisitos.length) continue;

    let ciclo = await tx.cicloAvaliacao.findFirst({
      where: { clienteId: cliente.id, normaId: norma.id, unidadeId: null, status: "EM_ANDAMENTO" },
      select: { id: true },
    });
    if (!ciclo) {
      const nome = `Autoavaliação ${ANO}`;
      const criadoEm = momento(Math.round((inicio.getTime() - HOJE.getTime()) / DIA), 9);
      ciclo = await tx.cicloAvaliacao.create({
        data: { clienteId: cliente.id, normaId: norma.id, nome, dataInicio: inicio, criadoPorId: ctx.controlador.id, criadoEm },
        select: { id: true },
      });
      contar(ctx, "ciclos");
      log(ctx, {
        acao: "ciclo.aberto",
        usuarioId: ctx.controlador.id,
        entidade: "CicloAvaliacao",
        entidadeId: ciclo.id,
        dados: { nome, norma: norma.codigo, unidadeId: null, requisitos: requisitos.length },
        criadoEm,
      });
    }
    await tx.respostaRequisito.createMany({
      data: requisitos.map((r) => ({ clienteId: cliente.id, cicloId: ciclo.id, requisitoId: r.id })),
      skipDuplicates: true,
    });

    const atuais = await tx.respostaRequisito.findMany({
      where: { cicloId: ciclo.id },
      select: { id: true, situacao: true, respondidoEm: true, requisitoId: true },
    });
    const porRequisito = new Map(atuais.map((a) => [a.requisitoId, a]));
    const respostas: RespostaDemo[] = [];
    const janela = Math.max(AGORA.getTime() - inicio.getTime(), DIA);
    for (const r of requisitos) {
      const atual = porRequisito.get(r.id)!;
      const chave = `${norma.codigo}:${r.codigo}`;
      let situacao = atual.situacao;
      const alvo = situacaoDemo(chave, norma.codigo);
      if (alvo && atual.situacao === "NAO_AVALIADO" && !atual.respondidoEm) {
        situacao = alvo;
        const respondente = sorteio(`quem:${chave}`) < 0.5 ? ctx.controlador : equipe(ctx, Math.floor(sorteio(`eq:${chave}`) * 2));
        const respondidoEm = new Date(inicio.getTime() + 13 * 3_600_000 + Math.floor(sorteio(`quando:${chave}`) * janela * 0.9));
        const fixa = RESPOSTAS_FIXAS[chave];
        await tx.respostaRequisito.update({
          where: { id: atual.id },
          data: {
            situacao,
            observacao: escolher(`obs:${chave}`, OBSERVACOES[alvo as keyof typeof OBSERVACOES]),
            evidencia: fixa?.evidencia ?? (alvo === "ATENDIDO" ? escolher(`ev:${chave}`, EVIDENCIAS) : null),
            respondidoPorId: respondente.id,
            respondidoEm,
          },
        });
        contar(ctx, "respostas");
        log(ctx, {
          acao: "resposta.salva",
          usuarioId: respondente.id,
          entidade: "RespostaRequisito",
          entidadeId: atual.id,
          dados: { cicloId: ciclo.id, requisito: r.codigo, de: "NAO_AVALIADO", para: situacao },
          criadoEm: respondidoEm,
        });
      }
      respostas.push({ id: atual.id, codigo: r.codigo, titulo: r.titulo, situacao });
    }
    ciclos.push({ id: ciclo.id, norma: norma.codigo, respostas });
  }
  return ciclos;
}

// ───────────────────────── Planos 5W2H ─────────────────────────

type MarcoDemo = { descricao: string; prazo: number; concluido?: number };
type AcaoDemo = {
  oQue: string;
  porQue?: string;
  onde?: string;
  unidade?: string;
  prazo?: number;
  responsavel?: string;
  como?: string;
  custo?: string;
  status: StatusAcao;
  prioridade: Prioridade;
  percentual?: number;
  respostaRequisitoId?: string;
  marcos?: MarcoDemo[];
};
type PlanoDemo = {
  titulo: string;
  descricao?: string;
  origem: OrigemPlano;
  status: StatusPlano;
  criado: number;
  cicloId?: string;
  situacaoId?: string;
  acoes: AcaoDemo[];
};

const PERCENTUAL: Record<StatusAcao, number> = { PENDENTE: 0, EM_ANDAMENTO: 50, AGUARDANDO_VALIDACAO: 100, CONCLUIDA: 100, CANCELADA: 0 };

async function criarPlano(ctx: Ctx, p: PlanoDemo): Promise<{ id: string; acoes: string[] }> {
  const { tx, cliente } = ctx;
  const existente = await tx.planoAcao.findFirst({ where: { clienteId: cliente.id, titulo: p.titulo }, select: { id: true, acoes: { select: { id: true }, orderBy: { criadoEm: "asc" } } } });
  if (existente) return { id: existente.id, acoes: existente.acoes.map((a) => a.id) };

  const criadoEm = momento(p.criado, 11);
  const plano = await tx.planoAcao.create({
    data: {
      clienteId: cliente.id,
      cicloId: p.cicloId,
      situacaoId: p.situacaoId,
      titulo: p.titulo,
      descricao: p.descricao,
      origem: p.origem,
      status: p.status,
      criadoPorId: ctx.controlador.id,
      criadoEm,
    },
    select: { id: true },
  });
  contar(ctx, "planos");
  log(ctx, {
    acao: "plano.criado",
    usuarioId: ctx.controlador.id,
    entidade: "PlanoAcao",
    entidadeId: plano.id,
    dados: { titulo: p.titulo, origem: p.origem, ...(p.situacaoId && { situacaoId: p.situacaoId }) },
    criadoEm,
  });
  const ids: string[] = [];
  for (const [i, a] of p.acoes.entries()) ids.push(await criarAcao(ctx, plano.id, a, p.criado, i));
  return { id: plano.id, acoes: ids };
}

async function criarAcao(ctx: Ctx, planoId: string, a: AcaoDemo, criado: number, i: number) {
  const { tx, cliente } = ctx;
  const criadoEm = momento(criado, 11 + Math.min(i, 5));
  const u = unidade(ctx, a.unidade);
  const concluida = a.status === "CONCLUIDA";
  const validadoEm = concluida ? momento(Math.min((a.prazo ?? 0) - 2, -1), 15) : undefined;
  const acao = await tx.acao.create({
    data: {
      clienteId: cliente.id,
      planoId,
      respostaRequisitoId: a.respostaRequisitoId,
      unidadeResponsavelId: u?.id,
      oQue: a.oQue.slice(0, 500),
      porQue: a.porQue,
      onde: a.onde ?? u?.nome,
      prazo: a.prazo === undefined ? undefined : dia(a.prazo),
      responsavel: a.responsavel ?? (u ? responsavel(ctx, u).nome : undefined),
      como: a.como,
      custoEstimado: a.custo,
      status: a.status,
      prioridade: a.prioridade,
      percentual: a.percentual ?? PERCENTUAL[a.status],
      validadoPorId: concluida ? ctx.controlador.id : undefined,
      validadoEm,
      parecerValidacao: concluida ? "Evidências conferidas pela Controladoria; ação concluída." : undefined,
      criadoEm,
      atualizadoEm: validadoEm ?? criadoEm,
    },
    select: { id: true },
  });
  contar(ctx, "acoes");
  log(ctx, {
    acao: "acao.criada",
    usuarioId: ctx.controlador.id,
    entidade: "Acao",
    entidadeId: acao.id,
    dados: { planoId, oQue: a.oQue.slice(0, 200), prazo: a.prazo === undefined ? null : iso(dia(a.prazo)) },
    criadoEm,
  });
  for (const [ordem, m] of (a.marcos ?? []).entries()) {
    const concluidoEm = m.concluido === undefined ? undefined : momento(m.concluido, 16);
    const marco = await tx.marcoAcao.create({
      data: { clienteId: cliente.id, acaoId: acao.id, descricao: m.descricao, prazo: dia(m.prazo), concluidoEm, ordem: ordem + 1, criadoEm },
      select: { id: true },
    });
    contar(ctx, "marcos");
    log(ctx, { acao: "marco.criado", usuarioId: ctx.controlador.id, entidade: "MarcoAcao", entidadeId: marco.id, dados: { acaoId: acao.id, descricao: m.descricao }, criadoEm });
    if (concluidoEm) {
      log(ctx, { acao: "marco.concluido", usuarioId: equipe(ctx).id, entidade: "MarcoAcao", entidadeId: marco.id, dados: { acaoId: acao.id }, criadoEm: concluidoEm });
    }
  }
  if (concluida && validadoEm) {
    log(ctx, { acao: "acao.validada", usuarioId: ctx.controlador.id, entidade: "Acao", entidadeId: acao.id, dados: { planoId }, criadoEm: validadoEm });
  }
  return acao.id;
}

const ROTULO_SITUACAO: Record<SituacaoRequisito, string> = {
  NAO_AVALIADO: "não avaliado",
  ATENDIDO: "atendido",
  PARCIALMENTE_ATENDIDO: "parcialmente atendido",
  NAO_ATENDIDO: "não atendido",
  NAO_APLICAVEL: "não aplicável",
};

async function planos(ctx: Ctx, ciclos: CicloDemo[]) {
  const ot05 = ciclos.find((c) => c.norma === "OT05");
  if (ot05) {
    const pendentes = ot05.respostas.filter((r) => r.situacao === "NAO_ATENDIDO" || r.situacao === "PARCIALMENTE_ATENDIDO").slice(0, 4);
    const roteiro: { status: StatusAcao; prazo: number; percentual?: number; marcos: MarcoDemo[] }[] = [
      { status: "CONCLUIDA", prazo: -20, marcos: [{ descricao: "Minuta elaborada pela Controladoria", prazo: -60, concluido: -62 }, { descricao: "Ato publicado no Diário Oficial", prazo: -20, concluido: -24 }] },
      { status: "EM_ANDAMENTO", prazo: 30, percentual: 60, marcos: [{ descricao: "Levantamento da situação atual", prazo: -15, concluido: -18 }, { descricao: "Proposta submetida ao Gabinete", prazo: 20 }] },
      { status: "AGUARDANDO_VALIDACAO", prazo: -5, marcos: [{ descricao: "Rotina implantada e evidências anexadas", prazo: -5, concluido: -6 }] },
      { status: "PENDENTE", prazo: 60, marcos: [{ descricao: "Definir responsável e cronograma", prazo: 25 }] },
    ];
    await criarPlano(ctx, {
      titulo: `Adequação da Controladoria à OT 05/2024 (TCM-BA) — ${ANO}`,
      descricao: "Ações para sanar os requisitos não atendidos ou parcialmente atendidos na autoavaliação do exercício.",
      origem: "REQUISITO",
      status: "EM_EXECUCAO",
      criado: -90,
      cicloId: ot05.id,
      acoes: pendentes.map((r, i) => ({
        oQue: `Regularizar o requisito ${r.codigo}: ${r.titulo}`,
        porQue: `Requisito avaliado como ${ROTULO_SITUACAO[r.situacao]} na autoavaliação ${ANO} (OT 05/2024).`,
        unidade: "CGM",
        como: "Elaborar ou revisar o ato normativo, implantar a rotina e reunir as evidências.",
        prioridade: i === 0 ? "ALTA" : i === 3 ? "BAIXA" : "MEDIA",
        respostaRequisitoId: r.id,
        ...roteiro[i],
      })),
    });
  }

  const tcm = await criarPlano(ctx, {
    titulo: "Determinações do TCM-BA no parecer prévio das contas de 2025",
    descricao: "Ressalvas e determinações registradas no parecer prévio sobre as contas anuais (cenário fictício).",
    origem: "DETERMINACAO_TC",
    status: "EM_EXECUCAO",
    criado: -75,
    acoes: [
      {
        oQue: "Atualizar o Portal da Transparência com contratos, diárias e folha de pagamento",
        porQue: "Determinação do TCM-BA: informações desatualizadas no portal (LC 131/2009 e Lei 12.527/2011).",
        unidade: "SEMAP-ADM",
        prazo: 25,
        como: "Levantar pendências, definir responsáveis por tipo de informação e publicar mensalmente.",
        custo: "0.00",
        status: "EM_ANDAMENTO",
        percentual: 40,
        prioridade: "ALTA",
        marcos: [
          { descricao: "Levantar pendências do portal", prazo: -40, concluido: -42 },
          { descricao: "Publicar contratos e aditivos do exercício", prazo: 10 },
          { descricao: "Publicar folha mensal nominal", prazo: 25 },
        ],
      },
      {
        oQue: "Concluir o inventário físico-financeiro dos bens móveis e imóveis",
        porQue: "Divergência entre o inventário e o saldo contábil do ativo imobilizado.",
        unidade: "SEMAP-PAT",
        prazo: 60,
        como: "Designar comissão de inventário, conferir plaquetas e conciliar com a contabilidade.",
        custo: "8500.00",
        status: "PENDENTE",
        prioridade: "ALTA",
        marcos: [{ descricao: "Portaria de designação da comissão", prazo: 15 }],
      },
      {
        oQue: "Implantar rotina mensal de conciliação bancária assinada pelo contador",
        porQue: "Saldos bancários sem conciliação em parte dos meses do exercício anterior.",
        unidade: "SEFIN-CONT",
        prazo: -10,
        como: "Conciliar todas as contas até o dia 10 do mês seguinte e arquivar os relatórios.",
        status: "CONCLUIDA",
        prioridade: "MEDIA",
        marcos: [{ descricao: "Conciliações de janeiro a agosto concluídas", prazo: -12, concluido: -14 }],
      },
    ],
  });

  await criarPlano(ctx, {
    titulo: "Implantação da Ouvidoria-Geral do Município",
    descricao: "Estruturar a macrofunção de ouvidoria prevista na OT 05/2024.",
    origem: "OUTRA",
    status: "RASCUNHO",
    criado: -12,
    acoes: [
      { oQue: "Elaborar minuta de decreto regulamentando a Ouvidoria", unidade: "GAB", prazo: 45, status: "PENDENTE", prioridade: "MEDIA" },
      {
        oQue: "Disponibilizar canal eletrônico de manifestações (Fala.BR ou formulário próprio)",
        unidade: "CGM",
        prazo: 75,
        custo: "0.00",
        status: "PENDENTE",
        prioridade: "BAIXA",
      },
    ],
  });
  return { acaoPortal: tcm.acoes[0] };
}

// ───────────────────────── Demandas ─────────────────────────

type PassoDemanda = { tipo: TipoTramite; dia: number; texto?: string; novoPrazo?: number; interno?: boolean };
type DemandaDemo = {
  assunto: string;
  descricao: string;
  unidade: string;
  prioridade: Prioridade;
  criada: number;
  prazo: number;
  passos: PassoDemanda[];
  respostaRequisitoId?: string;
  acaoId?: string;
  auditoriaId?: string;
};

const STATUS_DO_TRAMITE: Partial<Record<TipoTramite, StatusDemanda>> = {
  VISUALIZACAO: "VISUALIZADA",
  RESPOSTA: "RESPONDIDA",
  ANALISE: "EM_ANALISE",
  CONCLUSAO: "CONCLUIDA",
  DEVOLUCAO: "DEVOLVIDA",
  CANCELAMENTO: "CANCELADA",
};
const LOG_DO_TRAMITE: Record<TipoTramite, string> = {
  ENVIO: "demanda.criada",
  VISUALIZACAO: "demanda.visualizada",
  RESPOSTA: "demanda.respondida",
  ANALISE: "demanda.em_analise",
  CONCLUSAO: "demanda.concluida",
  DEVOLUCAO: "demanda.devolvida",
  CANCELAMENTO: "demanda.cancelada",
  PRORROGACAO_SOLICITADA: "demanda.prorrogacao_solicitada",
  PRORROGACAO_DEFERIDA: "demanda.prorrogacao_deferida",
  PRORROGACAO_INDEFERIDA: "demanda.prorrogacao_indeferida",
  COMENTARIO: "demanda.comentada",
};
const DO_SATELITE = new Set<TipoTramite>(["VISUALIZACAO", "RESPOSTA", "PRORROGACAO_SOLICITADA"]);

async function criarDemanda(ctx: Ctx, d: DemandaDemo) {
  const { tx, cliente } = ctx;
  const u = unidade(ctx, d.unidade);
  if (!u) return null;
  const existente = await tx.demanda.findFirst({ where: { clienteId: cliente.id, assunto: d.assunto }, select: { id: true } });
  if (existente) return existente.id;

  const criadoEm = momento(d.criada, 9);
  const ano = anoBahia(criadoEm);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`demanda:${cliente.id}:${ano}`}, 0))`;
  const ultima = await tx.demanda.aggregate({ where: { clienteId: cliente.id, ano }, _max: { numero: true } });
  const numero = (ultima._max.numero ?? 0) + 1;

  let status: StatusDemanda = "ENVIADA";
  let prazo = dia(d.prazo);
  for (const p of d.passos) {
    status = STATUS_DO_TRAMITE[p.tipo] ?? status;
    if ((p.tipo === "DEVOLUCAO" || p.tipo === "PRORROGACAO_DEFERIDA") && p.novoPrazo !== undefined) prazo = dia(p.novoPrazo);
  }
  const ultimoPasso = d.passos.at(-1);
  const autor = d.auditoriaId ? equipe(ctx) : ctx.controlador;
  const demanda = await tx.demanda.create({
    data: {
      clienteId: cliente.id,
      numero,
      ano,
      assunto: d.assunto,
      descricao: d.descricao,
      unidadeDestinoId: u.id,
      acaoId: d.acaoId,
      respostaRequisitoId: d.respostaRequisitoId,
      auditoriaId: d.auditoriaId,
      prazo,
      prioridade: d.prioridade,
      status,
      criadoPorId: autor.id,
      criadoEm,
      atualizadoEm: ultimoPasso ? momento(ultimoPasso.dia, 14) : criadoEm,
    },
    select: { id: true },
  });
  contar(ctx, "demandas");
  const numeroFmt = num(numero, ano);
  await tx.tramitacaoDemanda.create({
    data: { clienteId: cliente.id, demandaId: demanda.id, tipo: "ENVIO", statusNovo: "ENVIADA", usuarioId: autor.id, usuarioNome: autor.nome, criadoEm },
  });
  contar(ctx, "tramites");
  log(ctx, {
    acao: "demanda.criada",
    usuarioId: autor.id,
    entidade: "Demanda",
    entidadeId: demanda.id,
    dados: {
      numero: numeroFmt,
      assunto: d.assunto,
      unidade: u.nome,
      prazo: iso(dia(d.prazo)),
      prioridade: d.prioridade,
      anexos: 0,
      ...(d.respostaRequisitoId && { respostaRequisitoId: d.respostaRequisitoId }),
      ...(d.acaoId && { acaoId: d.acaoId }),
      ...(d.auditoriaId && { auditoriaId: d.auditoriaId }),
    },
    criadoEm,
  });

  let atual: StatusDemanda = "ENVIADA";
  let prazoAtual = dia(d.prazo);
  for (const [i, p] of d.passos.entries()) {
    const ator = DO_SATELITE.has(p.tipo) ? responsavel(ctx, u) : p.tipo === "ANALISE" || p.tipo === "COMENTARIO" ? equipe(ctx) : ctx.controlador;
    const novo = STATUS_DO_TRAMITE[p.tipo];
    const quando = momento(p.dia, 10 + (i % 6));
    const novoPrazo = p.novoPrazo === undefined ? undefined : dia(p.novoPrazo);
    await tx.tramitacaoDemanda.create({
      data: {
        clienteId: cliente.id,
        demandaId: demanda.id,
        tipo: p.tipo,
        statusAnterior: novo ? atual : null,
        statusNovo: novo ?? null,
        texto: p.texto,
        novoPrazo,
        interno: p.interno ?? false,
        usuarioId: ator.id,
        usuarioNome: ator.nome,
        criadoEm: quando,
      },
    });
    contar(ctx, "tramites");
    const mudaPrazo = novoPrazo && (p.tipo === "DEVOLUCAO" || p.tipo === "PRORROGACAO_DEFERIDA");
    log(ctx, {
      acao: LOG_DO_TRAMITE[p.tipo],
      usuarioId: ator.id,
      entidade: "Demanda",
      entidadeId: demanda.id,
      dados: {
        numero: numeroFmt,
        ...(novo && { de: atual, para: novo }),
        ...(mudaPrazo && { prazoAnterior: iso(prazoAtual), novoPrazo: iso(novoPrazo) }),
        ...(p.tipo === "PRORROGACAO_SOLICITADA" && novoPrazo && { novoPrazo: iso(novoPrazo) }),
        ...(p.tipo === "COMENTARIO" && { interno: p.interno ?? false }),
        anexos: 0,
      },
      criadoEm: quando,
    });
    if (novo) atual = novo;
    if (mudaPrazo) prazoAtual = novoPrazo;
  }
  return demanda.id;
}

async function demandas(ctx: Ctx, ciclos: CicloDemo[], acaoPortal: string | undefined) {
  const lista: DemandaDemo[] = [
    {
      assunto: "Envio do inventário anual de bens móveis",
      descricao: "Encaminhar o inventário anual dos bens móveis, por unidade, com termo de responsabilidade assinado e relação de bens inservíveis.",
      unidade: "SEMAP-PAT",
      prioridade: "ALTA",
      criada: -50,
      prazo: -30,
      passos: [{ tipo: "VISUALIZACAO", dia: -47 }],
    },
    {
      assunto: "Relação de contratos vigentes e fiscais designados",
      descricao: "Enviar planilha com todos os contratos vigentes, valores, vigência, aditivos e portaria de designação do fiscal de cada contrato (Lei 14.133/2021, art. 117).",
      unidade: "SEMAP-LIC",
      prioridade: "URGENTE",
      criada: -35,
      prazo: -20,
      passos: [{ tipo: "COMENTARIO", dia: -10, texto: "Prazo vencido sem visualização. Reiterar por ofício ao Secretário.", interno: true }],
    },
    {
      assunto: "Conciliações bancárias de julho a setembro",
      descricao: "Remeter as conciliações bancárias de todas as contas do Município referentes ao 3º trimestre, assinadas pelo contador responsável.",
      unidade: "SEFIN-CONT",
      prioridade: "MEDIA",
      criada: -20,
      prazo: -10,
      passos: [
        { tipo: "VISUALIZACAO", dia: -19 },
        { tipo: "RESPOSTA", dia: -12, texto: "Seguem as conciliações das 14 contas bancárias, com extratos e relatórios do sistema contábil." },
      ],
    },
    {
      assunto: "Aplicação mínima em ações e serviços de saúde — 2º quadrimestre",
      descricao: "Demonstrar a aplicação do mínimo constitucional de 15% em ações e serviços públicos de saúde (LC 141/2012) até o 2º quadrimestre.",
      unidade: "SESAU",
      prioridade: "ALTA",
      criada: -30,
      prazo: -15,
      passos: [
        { tipo: "VISUALIZACAO", dia: -29 },
        { tipo: "RESPOSTA", dia: -16, texto: "Encaminhamos o demonstrativo do SIOPS do 2º quadrimestre, com aplicação de 17,4% da receita de impostos." },
        { tipo: "ANALISE", dia: -14 },
      ],
    },
    {
      assunto: "Relação de servidores contratados por REDA — folha de agosto",
      descricao: "Enviar a relação nominal dos contratados por Regime Especial de Direito Administrativo, com data de admissão, lotação e processo seletivo correspondente.",
      unidade: "SEMAP-RH",
      prioridade: "MEDIA",
      criada: -45,
      prazo: -30,
      passos: [
        { tipo: "VISUALIZACAO", dia: -44 },
        { tipo: "RESPOSTA", dia: -33, texto: "Segue a relação com 31 contratados, lotação e referência ao processo seletivo de cada um." },
        { tipo: "CONCLUSAO", dia: -28, texto: "Resposta aceita. Informações usadas na auditoria de folha." },
      ],
    },
    {
      assunto: "Prestação de contas do PNAE — 1º semestre",
      descricao: "Apresentar a prestação de contas do Programa Nacional de Alimentação Escolar do 1º semestre, com notas fiscais, cardápios e comprovação da compra da agricultura familiar (mínimo de 30%).",
      unidade: "SEDUC-ALIM",
      prioridade: "MEDIA",
      criada: -28,
      prazo: -18,
      passos: [
        { tipo: "VISUALIZACAO", dia: -27 },
        { tipo: "RESPOSTA", dia: -19, texto: "Encaminhamos as notas fiscais e os cardápios do semestre." },
        { tipo: "DEVOLUCAO", dia: -15, novoPrazo: 5, texto: "Faltam os extratos da conta do PNAE e a comprovação do percentual da agricultura familiar." },
      ],
    },
    {
      assunto: "Boletins de medição da obra de pavimentação em paralelepípedo",
      descricao: "Encaminhar os boletins de medição, o diário de obra e as ARTs de fiscalização da obra de pavimentação das ruas do Centro.",
      unidade: "SEINFRA-OBRAS",
      prioridade: "MEDIA",
      criada: -10,
      prazo: 5,
      passos: [{ tipo: "VISUALIZACAO", dia: -9 }],
    },
    {
      assunto: "Cadastro de beneficiários de benefícios eventuais",
      descricao: "Enviar a relação de beneficiários de benefícios eventuais concedidos no exercício, com critérios de concessão e pareceres sociais.",
      unidade: "SEMAS",
      prioridade: "BAIXA",
      criada: -5,
      prazo: 15,
      passos: [],
    },
    {
      assunto: "Dívida ativa inscrita e cobrada no exercício",
      descricao: "Informar o estoque da dívida ativa, as inscrições e as cobranças (administrativas e judiciais) realizadas no exercício.",
      unidade: "SEFIN-TRIB",
      prioridade: "MEDIA",
      criada: -25,
      prazo: -10,
      passos: [
        { tipo: "VISUALIZACAO", dia: -24 },
        { tipo: "PRORROGACAO_SOLICITADA", dia: -12, novoPrazo: 10, texto: "O sistema tributário está em migração; pedimos 20 dias para extrair os relatórios." },
        { tipo: "PRORROGACAO_DEFERIDA", dia: -11, novoPrazo: 10, texto: "Prorrogação deferida." },
      ],
    },
    {
      assunto: "Concessão de diárias a servidores — 1º semestre",
      descricao: "Enviar as portarias de concessão de diárias e os relatórios de viagem do 1º semestre.",
      unidade: "SEMAP",
      prioridade: "BAIXA",
      criada: -60,
      prazo: -45,
      passos: [{ tipo: "CANCELAMENTO", dia: -55, texto: "Assunto será tratado na auditoria de folha de pagamento prevista no PAAI." }],
    },
  ];

  const tcm = ciclos.find((c) => c.norma !== "OT05");
  const parcial = tcm?.respostas.find((r) => r.situacao === "PARCIALMENTE_ATENDIDO");
  if (parcial) {
    lista.push({
      assunto: `Comprovação do requisito ${parcial.codigo} da autoavaliação (${tcm!.norma})`,
      descricao: `Encaminhar documentos que comprovem o atendimento integral do requisito "${parcial.titulo}".`,
      unidade: "SEFIN-CONT",
      prioridade: "MEDIA",
      criada: -18,
      prazo: -4,
      respostaRequisitoId: parcial.id,
      passos: [
        { tipo: "VISUALIZACAO", dia: -17 },
        { tipo: "RESPOSTA", dia: -6, texto: "Segue a documentação solicitada, com os relatórios do sistema contábil." },
      ],
    });
  }
  if (acaoPortal) {
    lista.push({
      assunto: "Cronograma de atualização do Portal da Transparência",
      descricao: "Apresentar cronograma com responsáveis e datas para publicar contratos, diárias e folha no Portal da Transparência.",
      unidade: "SEMAP-ADM",
      prioridade: "ALTA",
      criada: -38,
      prazo: -25,
      acaoId: acaoPortal,
      passos: [
        { tipo: "VISUALIZACAO", dia: -37 },
        { tipo: "RESPOSTA", dia: -27, texto: "Segue o cronograma aprovado pelo Secretário, com publicação mensal até o dia 15." },
        { tipo: "CONCLUSAO", dia: -26, texto: "Cronograma aceito; acompanhamento pelo plano de ação." },
      ],
    });
  }
  for (const d of lista) await criarDemanda(ctx, d);
}

// ───────────────────────── Medidas ─────────────────────────

type SituacaoDemo = {
  titulo: string;
  descricao: string;
  origem: OrigemSituacao;
  unidade: string;
  probabilidade: number;
  impacto: number;
  criada: number;
  sigilosa?: boolean;
  denunciante?: string;
  encerrada?: { dia: number; justificativa: string };
  plano?: { criado: number; acoes: AcaoDemo[] };
};

async function medidas(ctx: Ctx) {
  const lista: SituacaoDemo[] = [
    {
      titulo: "Possível acúmulo irregular de cargos de profissionais de saúde",
      descricao: "Denúncia aponta profissionais com vínculos simultâneos no Município e em municípios vizinhos, com cargas horárias incompatíveis.",
      origem: "DENUNCIA",
      unidade: "SESAU",
      probabilidade: 3,
      impacto: 4,
      criada: -40,
      sigilosa: true,
      denunciante: "Manifestação recebida pela Ouvidoria (identidade preservada)",
      plano: {
        criado: -36,
        acoes: [
          { oQue: "Cruzar a folha municipal com o CNES dos profissionais citados", unidade: "CGM", prazo: 10, status: "EM_ANDAMENTO", percentual: 50, prioridade: "ALTA" },
          { oQue: "Notificar os servidores para opção de vínculo ou comprovação de compatibilidade de horários", unidade: "SEMAP-RH", prazo: 30, status: "PENDENTE", prioridade: "ALTA" },
        ],
      },
    },
    {
      titulo: "Despesa com pessoal acima do limite prudencial da LRF",
      descricao: "O Relatório de Gestão Fiscal do 2º quadrimestre indica despesa com pessoal de 51,8% da receita corrente líquida, acima do limite prudencial de 51,3% (LRF, art. 22).",
      origem: "ALERTA",
      unidade: "SEFIN",
      probabilidade: 4,
      impacto: 5,
      criada: -25,
      plano: {
        criado: -22,
        acoes: [
          { oQue: "Suspender novas contratações temporárias e horas extras não essenciais", unidade: "SEMAP-RH", prazo: 5, status: "EM_ANDAMENTO", percentual: 70, prioridade: "URGENTE" },
          { oQue: "Elaborar plano de recondução da despesa com pessoal ao limite legal (LRF, art. 23)", unidade: "SEFIN-CONT", prazo: 40, status: "PENDENTE", prioridade: "ALTA" },
        ],
      },
    },
    {
      titulo: "Frota sem controle individualizado de quilometragem e abastecimento",
      descricao: "Em visita in loco, constatou-se que os veículos não têm ficha de controle de quilometragem e que os abastecimentos não são vinculados ao veículo.",
      origem: "CONSTATACAO",
      unidade: "SEINFRA-TRANSP",
      probabilidade: 4,
      impacto: 3,
      criada: -8,
    },
    {
      titulo: "Ofício do Ministério Público sobre o transporte escolar",
      descricao: "A Promotoria de Justiça solicitou informações sobre as rotas, os veículos e os condutores do transporte escolar.",
      origem: "DEMANDA_EXTERNA",
      unidade: "SEDUC-TRANSP",
      probabilidade: 2,
      impacto: 4,
      criada: -70,
      encerrada: { dia: -50, justificativa: "Informações prestadas à Promotoria no prazo; procedimento arquivado pelo Ministério Público." },
    },
  ];

  const { tx, cliente } = ctx;
  for (const s of lista) {
    const u = unidade(ctx, s.unidade);
    if (!u) continue;
    if (await tx.situacao.findFirst({ where: { clienteId: cliente.id, titulo: s.titulo }, select: { id: true } })) continue;

    const criadoEm = momento(s.criada, 10);
    const ano = anoBahia(criadoEm);
    const ultima = await tx.situacao.aggregate({ where: { clienteId: cliente.id, ano }, _max: { numero: true } });
    const numero = (ultima._max.numero ?? 0) + 1;
    const encerradoEm = s.encerrada ? momento(s.encerrada.dia, 15) : undefined;
    const situacao = await tx.situacao.create({
      data: {
        clienteId: cliente.id,
        numero,
        ano,
        titulo: s.titulo,
        descricao: s.descricao,
        origem: s.origem,
        unidadeId: u.id,
        probabilidade: s.probabilidade,
        impacto: s.impacto,
        status: s.encerrada ? "RESOLVIDA" : s.plano ? "EM_TRATAMENTO" : "ABERTA",
        sigilosa: s.sigilosa ?? false,
        denunciante: s.denunciante,
        criadoPorId: ctx.controlador.id,
        criadoEm,
        atualizadoEm: encerradoEm ?? criadoEm,
        encerradoPorId: s.encerrada ? ctx.controlador.id : undefined,
        encerradoEm,
        justificativaEncerramento: s.encerrada?.justificativa,
      },
      select: { id: true },
    });
    contar(ctx, "situacoes");
    log(ctx, {
      acao: "situacao.criada",
      usuarioId: ctx.controlador.id,
      entidade: "Situacao",
      entidadeId: situacao.id,
      dados: { numero: num(numero, ano), titulo: s.titulo, origem: s.origem, gravidade: s.probabilidade * s.impacto },
      criadoEm,
    });
    if (s.plano) {
      await criarPlano(ctx, {
        titulo: `Medida ${num(numero, ano)} — ${s.titulo}`.slice(0, 200),
        origem: "MEDIDA",
        status: "EM_EXECUCAO",
        criado: s.plano.criado,
        situacaoId: situacao.id,
        acoes: s.plano.acoes,
      });
      log(ctx, {
        acao: "situacao.status_alterado",
        usuarioId: ctx.controlador.id,
        entidade: "Situacao",
        entidadeId: situacao.id,
        dados: { de: "ABERTA", para: "EM_TRATAMENTO", motivo: "Plano de ação criado" },
        criadoEm: momento(s.plano.criado, 11),
      });
    }
    if (encerradoEm) {
      log(ctx, {
        acao: "situacao.status_alterado",
        usuarioId: ctx.controlador.id,
        entidade: "Situacao",
        entidadeId: situacao.id,
        dados: { de: "ABERTA", para: "RESOLVIDA", justificativa: s.encerrada!.justificativa },
        criadoEm: encerradoEm,
      });
    }
  }
}

// ───────────────────────── Auditorias ─────────────────────────

type ItemPaaiDemo = { titulo: string; tipo: TipoAuditoria; unidade: string; objetivo: string; probabilidade: number; impacto: number; mesInicio: number; mesFim: number };

const ITENS_PAAI: ItemPaaiDemo[] = [
  {
    titulo: "Folha de pagamento e contratações temporárias (REDA)",
    tipo: "FINANCEIRA",
    unidade: "SEMAP-RH",
    objetivo: "Verificar a legalidade das admissões temporárias e a regularidade dos pagamentos da folha.",
    probabilidade: 4,
    impacto: 4,
    mesInicio: 3,
    mesFim: 5,
  },
  {
    titulo: "Licitações e contratos — pregões eletrônicos do exercício",
    tipo: "CONFORMIDADE",
    unidade: "SEMAP-LIC",
    objetivo: "Avaliar a conformidade dos pregões com a Lei 14.133/2021 e a publicação no PNCP.",
    probabilidade: 3,
    impacto: 4,
    mesInicio: 6,
    mesFim: 8,
  },
  {
    titulo: "Transporte escolar — contratos, rotas e frota",
    tipo: "OPERACIONAL",
    unidade: "SEDUC-TRANSP",
    objetivo: "Avaliar a execução dos contratos de transporte escolar, as rotas e as condições dos veículos.",
    probabilidade: 3,
    impacto: 3,
    mesInicio: 9,
    mesFim: 10,
  },
  {
    titulo: "Almoxarifado e consumo de combustíveis",
    tipo: "OPERACIONAL",
    unidade: "SEINFRA",
    objetivo: "Verificar os controles de entrada, saída e estoque do almoxarifado e o consumo de combustíveis por veículo.",
    probabilidade: 4,
    impacto: 3,
    mesInicio: 10,
    mesFim: 11,
  },
  {
    titulo: "Gestão fiscal — LRF e transparência",
    tipo: "GESTAO",
    unidade: "SEFIN",
    objetivo: "Acompanhar os limites da LRF, as metas fiscais e a publicação dos relatórios RREO e RGF.",
    probabilidade: 3,
    impacto: 5,
    mesInicio: 11,
    mesFim: 12,
  },
];

async function paai(ctx: Ctx) {
  const { tx, cliente } = ctx;
  let plano = await tx.planoAnualAuditoria.findUnique({ where: { clienteId_ano: { clienteId: cliente.id, ano: ANO } }, select: { id: true } });
  if (!plano) {
    const criadoEm = instanteAno(1, 22, 10);
    const aprovadoEm = instanteAno(1, 31, 16);
    plano = await tx.planoAnualAuditoria.create({
      data: {
        clienteId: cliente.id,
        ano: ANO,
        status: "APROVADO",
        observacoes: "Plano elaborado com base na matriz de risco das unidades (probabilidade × impacto).",
        criadoPorId: ctx.controlador.id,
        criadoEm,
        atualizadoEm: aprovadoEm,
        aprovadoPorId: ctx.controlador.id,
        aprovadoEm,
      },
      select: { id: true },
    });
    contar(ctx, "paai");
    log(ctx, { acao: "paai.criado", usuarioId: ctx.controlador.id, entidade: "PlanoAnualAuditoria", entidadeId: plano.id, dados: { ano: ANO }, criadoEm });
    log(ctx, { acao: "paai.aprovado", usuarioId: ctx.controlador.id, entidade: "PlanoAnualAuditoria", entidadeId: plano.id, dados: { ano: ANO }, criadoEm: aprovadoEm });
  }
  const itens = new Map<string, string>();
  for (const it of ITENS_PAAI) {
    const u = unidade(ctx, it.unidade);
    if (!u) continue;
    let item = await tx.itemPlanoAuditoria.findFirst({ where: { planoId: plano.id, titulo: it.titulo }, select: { id: true } });
    if (!item) {
      const criadoEm = instanteAno(1, 22, 11);
      item = await tx.itemPlanoAuditoria.create({
        data: {
          clienteId: cliente.id,
          planoId: plano.id,
          titulo: it.titulo,
          tipo: it.tipo,
          unidadeId: u.id,
          objetivo: it.objetivo,
          probabilidade: it.probabilidade,
          impacto: it.impacto,
          mesInicio: it.mesInicio,
          mesFim: it.mesFim,
          criadoEm,
        },
        select: { id: true },
      });
      contar(ctx, "itensPaai");
      log(ctx, {
        acao: "paai.item_incluido",
        usuarioId: ctx.controlador.id,
        entidade: "ItemPlanoAuditoria",
        entidadeId: item.id,
        dados: { titulo: it.titulo, risco: it.probabilidade * it.impacto },
        criadoEm,
      });
    }
    itens.set(it.titulo, item.id);
  }
  return itens;
}

type AchadoDemo = {
  titulo: string;
  condicao: string;
  criterio: string;
  causa: string;
  efeito: string;
  probabilidade: number;
  impacto: number;
  recomendacoes: { texto: string; unidade: string; prazo: number }[];
};
type AuditoriaDemo = {
  item: ItemPaaiDemo;
  escopo: string;
  criterios: string;
  inicio: [number, number];
  fim: [number, number];
  /** Estados percorridos após o planejamento, com a data (mês, dia) de cada transição. */
  trajeto: [StatusAuditoria, number, number][];
  checklist?: { modelo: string; resultados: (ResultadoItemChecklist | null)[] };
  achados: AchadoDemo[];
  questoes?: { questao: string; informacoes: string; fontes: string; procedimentos: string }[];
  /** Gera as ações das recomendações ao chegar ao relatório final. */
  gerarAcoes?: boolean;
  solicitacao?: Omit<DemandaDemo, "auditoriaId" | "unidade">;
};

async function auditorias(ctx: Ctx) {
  const itens = await paai(ctx);
  const lista: AuditoriaDemo[] = [
    {
      item: ITENS_PAAI[0],
      escopo: "Folhas de janeiro a abril do exercício; contratos REDA vigentes; gratificações e adicionais.",
      criterios: "CF/88, art. 37, II e IX; LRF, arts. 18 a 23; lei municipal de contratação temporária.",
      inicio: [3, 2],
      fim: [5, 29],
      trajeto: [
        ["EXECUCAO", 3, 2],
        ["RELATORIO_PRELIMINAR", 6, 1],
        ["MANIFESTACAO", 6, 10],
        ["RELATORIO_FINAL", 7, 8],
        ["MONITORAMENTO", 7, 15],
      ],
      checklist: { modelo: "Folha de pagamento", resultados: ["CONFORME", "NAO_CONFORME", "CONFORME", "PARCIAL", "CONFORME", "NAO_CONFORME", "CONFORME", "NAO_APLICAVEL"] },
      achados: [
        {
          titulo: "Contratações temporárias sem processo seletivo simplificado",
          condicao: "Na amostra de 31 contratos REDA vigentes, 12 não tinham processo seletivo nem justificativa de excepcional interesse público.",
          criterio: "CF/88, art. 37, IX; lei municipal de contratação temporária.",
          causa: "Ausência de rotina formal de seleção e de controle dos prazos dos contratos.",
          efeito: "Risco de nulidade das contratações, apontamento pelo TCM-BA e responsabilização do gestor.",
          probabilidade: 4,
          impacto: 4,
          recomendacoes: [
            { texto: "Instituir processo seletivo simplificado para todas as contratações temporárias, com edital publicado.", unidade: "SEMAP-RH", prazo: 45 },
            { texto: "Implantar controle de vencimento dos contratos REDA no sistema de folha.", unidade: "SEMAP-RH", prazo: 30 },
          ],
        },
        {
          titulo: "Gratificações pagas sem ato concessório",
          condicao: "Cinco servidores recebem gratificação de função sem portaria de concessão arquivada na pasta funcional.",
          criterio: "Princípio da legalidade (CF/88, art. 37, caput); estatuto dos servidores municipais.",
          causa: "Concessões verbais lançadas diretamente na folha, sem conferência documental.",
          efeito: "Pagamentos sem amparo legal e risco de devolução ao erário.",
          probabilidade: 3,
          impacto: 3,
          recomendacoes: [{ texto: "Levantar os atos concessórios das gratificações e suspender os pagamentos sem amparo legal.", unidade: "SEMAP-RH", prazo: 20 }],
        },
      ],
      gerarAcoes: true,
    },
    {
      item: ITENS_PAAI[1],
      escopo: "Pregões eletrônicos homologados de janeiro a junho do exercício.",
      criterios: "Lei 14.133/2021; decreto municipal de regulamentação das licitações.",
      inicio: [6, 2],
      fim: [8, 29],
      trajeto: [["EXECUCAO", 6, 2]],
      checklist: { modelo: "Licitação — pregão", resultados: ["CONFORME", "CONFORME", "NAO_CONFORME", "CONFORME", "PARCIAL", null, null, null, null] },
      achados: [
        {
          titulo: "Pesquisa de preços com menos de três fontes",
          condicao: "Em 3 dos 5 pregões analisados a estimativa de preços baseou-se em uma ou duas cotações de fornecedores.",
          criterio: "Lei 14.133/2021, art. 23, § 1º.",
          causa: "Desconhecimento dos parâmetros legais e ausência de modelo padronizado de pesquisa de preços.",
          efeito: "Risco de sobrepreço e de questionamento das contratações.",
          probabilidade: 3,
          impacto: 3,
          recomendacoes: [],
        },
      ],
      solicitacao: {
        assunto: "Solicitação de auditoria: processos dos pregões eletrônicos do 1º semestre",
        descricao: "Disponibilizar cópia integral dos processos dos pregões eletrônicos homologados de janeiro a junho, incluindo pesquisa de preços e pareceres.",
        prioridade: "ALTA",
        criada: -110,
        prazo: -100,
        passos: [
          { tipo: "VISUALIZACAO", dia: -109 },
          { tipo: "RESPOSTA", dia: -101, texto: "Processos digitalizados disponibilizados à equipe de auditoria." },
          { tipo: "CONCLUSAO", dia: -98, texto: "Documentação recebida." },
        ],
      },
    },
    {
      item: ITENS_PAAI[2],
      escopo: "Contratos de transporte escolar vigentes e rotas do 2º semestre.",
      criterios: "Lei 14.133/2021; Código de Trânsito Brasileiro, arts. 136 a 139; resoluções do FNDE sobre o PNATE.",
      inicio: [9, 15],
      fim: [10, 30],
      trajeto: [],
      achados: [],
      questoes: [
        {
          questao: "As rotas contratadas correspondem às rotas efetivamente executadas?",
          informacoes: "Rotas contratadas, quilometragem paga, relação de alunos transportados.",
          fontes: "Contratos, medições, Censo Escolar, entrevistas com diretores.",
          procedimentos: "Comparar a quilometragem paga com a medida por georreferenciamento em amostra de rotas.",
        },
        {
          questao: "Os veículos e condutores atendem às exigências do CTB para o transporte escolar?",
          informacoes: "Autorização do Detran, vistoria semestral, curso especializado do condutor.",
          fontes: "Documentos dos veículos e condutores, inspeção física.",
          procedimentos: "Inspecionar os veículos em uso e conferir a documentação de toda a frota.",
        },
        {
          questao: "Os recursos do PNATE foram aplicados e prestados contas regularmente?",
          informacoes: "Extratos da conta do PNATE e pagamentos realizados.",
          fontes: "Sistema contábil, extratos bancários, SiGPC/FNDE.",
          procedimentos: "Conciliar os pagamentos com os extratos e com a prestação de contas.",
        },
      ],
    },
  ];

  const { tx, cliente } = ctx;
  const time = [ctx.controlador.id, ...ctx.equipe.map((e) => e.id)].slice(0, 2);
  for (const a of lista) {
    const u = unidade(ctx, a.item.unidade);
    const itemId = itens.get(a.item.titulo);
    if (!u || !itemId) continue;
    if (await tx.auditoria.findFirst({ where: { clienteId: cliente.id, ano: ANO, titulo: a.item.titulo }, select: { id: true } })) continue;
    if (await tx.auditoria.findUnique({ where: { itemPlanoId: itemId }, select: { id: true } })) continue;

    const ultima = await tx.auditoria.aggregate({ where: { clienteId: cliente.id, ano: ANO }, _max: { numero: true } });
    const numero = (ultima._max.numero ?? 0) + 1;
    const criadoEm = instanteAno(a.inicio[0], Math.max(a.inicio[1] - 10, 1), 9);
    const auditoria = await tx.auditoria.create({
      data: {
        clienteId: cliente.id,
        numero,
        ano: ANO,
        titulo: a.item.titulo,
        tipo: a.item.tipo,
        objetivo: a.item.objetivo,
        escopo: a.escopo,
        unidadeId: u.id,
        criterios: a.criterios,
        equipeIds: time,
        itemPlanoId: itemId,
        inicioPrevisto: dataAno(...a.inicio),
        fimPrevisto: dataAno(...a.fim),
        criadoPorId: ctx.controlador.id,
        criadoEm,
      },
      select: { id: true },
    });
    contar(ctx, "auditorias");
    const numeroFmt = num(numero, ANO);
    log(ctx, {
      acao: "auditoria.criada",
      usuarioId: ctx.controlador.id,
      entidade: "Auditoria",
      entidadeId: auditoria.id,
      dados: { numero: numeroFmt, titulo: a.item.titulo, tipo: a.item.tipo, itemPlanoId: itemId },
      criadoEm,
    });

    for (const [ordem, q] of (a.questoes ?? []).entries()) {
      const questao = await tx.questaoAuditoria.create({ data: { clienteId: cliente.id, auditoriaId: auditoria.id, ordem: ordem + 1, ...q, criadoEm }, select: { id: true } });
      log(ctx, { acao: "auditoria.questao_criada", usuarioId: equipe(ctx).id, entidade: "QuestaoAuditoria", entidadeId: questao.id, dados: { auditoriaId: auditoria.id }, criadoEm });
    }

    const itensChecklist: { id: string; resultado: ResultadoItemChecklist | null }[] = [];
    if (a.checklist) {
      const modelo = await tx.modeloChecklist.findFirst({ where: { clienteId: cliente.id, nome: a.checklist.modelo, ativo: true }, select: { id: true } });
      if (modelo) {
        const [{ id: checklistId }] = await tx.$queryRaw<{ id: string }[]>`
          SELECT auditoria_aplicar_checklist(${auditoria.id}::uuid, ${modelo.id}::uuid, ${ctx.controlador.id}::uuid) AS id`;
        log(ctx, { acao: "auditoria.checklist_aplicado", usuarioId: ctx.controlador.id, entidade: "Auditoria", entidadeId: auditoria.id, dados: { modelo: a.checklist.modelo }, criadoEm });
        const aplicados = await tx.itemChecklistAuditoria.findMany({ where: { checklistId }, select: { id: true }, orderBy: { ordem: "asc" } });
        for (const [i, it] of aplicados.entries()) itensChecklist.push({ id: it.id, resultado: a.checklist.resultados[i] ?? null });
      }
    }

    let status: StatusAuditoria = "PLANEJAMENTO";
    let achadosFeitos = false;
    const registrarAchados = async (quando: Date) => {
      achadosFeitos = true;
      for (const [i, it] of itensChecklist.entries()) {
        if (!it.resultado) continue;
        const avaliadoEm = new Date(quando.getTime() + (i + 1) * 3_600_000);
        await tx.itemChecklistAuditoria.update({
          where: { id: it.id },
          data: {
            resultado: it.resultado,
            observacao: it.resultado === "CONFORME" ? "Verificado na amostra, sem ressalvas." : it.resultado === "NAO_APLICAVEL" ? "Não se aplica ao escopo." : "Ver achado correspondente.",
            avaliadoPorId: equipe(ctx).id,
            avaliadoEm,
          },
        });
        log(ctx, { acao: "auditoria.item_avaliado", usuarioId: equipe(ctx).id, entidade: "ItemChecklistAuditoria", entidadeId: it.id, dados: { auditoriaId: auditoria.id, resultado: it.resultado }, criadoEm: avaliadoEm });
      }
      const naoConformes = itensChecklist.filter((it) => it.resultado === "NAO_CONFORME" || it.resultado === "PARCIAL");
      for (const [i, ach] of a.achados.entries()) {
        const quandoAchado = new Date(quando.getTime() + (i + 1) * DIA * 7);
        const achado = await tx.achado.create({
          data: {
            clienteId: cliente.id,
            auditoriaId: auditoria.id,
            numero: i + 1,
            titulo: ach.titulo,
            condicao: ach.condicao,
            criterio: ach.criterio,
            causa: ach.causa,
            efeito: ach.efeito,
            probabilidade: ach.probabilidade,
            impacto: ach.impacto,
            itemChecklistId: naoConformes[i]?.id,
            criadoPorId: equipe(ctx).id,
            criadoEm: quandoAchado,
            atualizadoEm: quandoAchado,
          },
          select: { id: true },
        });
        contar(ctx, "achados");
        log(ctx, { acao: "achado.criado", usuarioId: equipe(ctx).id, entidade: "Achado", entidadeId: achado.id, dados: { auditoriaId: auditoria.id, numero: i + 1, titulo: ach.titulo }, criadoEm: quandoAchado });
        for (const [j, r] of ach.recomendacoes.entries()) {
          const rec = await tx.recomendacao.create({
            data: {
              clienteId: cliente.id,
              achadoId: achado.id,
              numero: j + 1,
              texto: r.texto,
              unidadeId: unidade(ctx, r.unidade)?.id,
              prazo: dia(r.prazo),
              criadoPorId: ctx.controlador.id,
              criadoEm: quandoAchado,
            },
            select: { id: true },
          });
          contar(ctx, "recomendacoes");
          log(ctx, { acao: "recomendacao.criada", usuarioId: ctx.controlador.id, entidade: "Recomendacao", entidadeId: rec.id, dados: { achadoId: achado.id, numero: j + 1 }, criadoEm: quandoAchado });
        }
      }
    };

    for (const [para, mes, d] of a.trajeto) {
      const quando = instanteAno(mes, d, 10);
      await tx.auditoria.update({ where: { id: auditoria.id }, data: { status: para, atualizadoEm: quando } });
      log(ctx, {
        acao: para === "ENCERRADA" ? "auditoria.encerrada" : "auditoria.status_alterado",
        usuarioId: ctx.controlador.id,
        entidade: "Auditoria",
        entidadeId: auditoria.id,
        dados: { numero: numeroFmt, de: status, para },
        criadoEm: quando,
      });
      status = para;
      if (para === "EXECUCAO" && !achadosFeitos) await registrarAchados(quando);
      if (para === "RELATORIO_FINAL" && a.gerarAcoes) {
        const recs = await tx.recomendacao.findMany({ where: { achado: { auditoriaId: auditoria.id } }, select: { id: true }, orderBy: [{ achado: { numero: "asc" } }, { numero: "asc" }] });
        for (const [i, r] of recs.entries()) {
          const [gerada] = await tx.$queryRaw<{ o_acao_id: string; o_plano_id: string; o_criada: boolean }[]>`
            SELECT o_acao_id, o_plano_id, o_criada FROM recomendacao_gerar_acao(${r.id}::uuid, ${ctx.controlador.id}::uuid)`;
          if (!gerada?.o_criada) continue;
          if (i === 0) {
            await tx.planoAcao.update({ where: { id: gerada.o_plano_id }, data: { criadoEm: quando } });
            contar(ctx, "planos");
            log(ctx, { acao: "plano.criado", usuarioId: ctx.controlador.id, entidade: "PlanoAcao", entidadeId: gerada.o_plano_id, dados: { origem: "AUDITORIA", auditoriaId: auditoria.id }, criadoEm: quando });
          }
          const andamento: StatusAcao = i === 0 ? "EM_ANDAMENTO" : i === 2 ? "AGUARDANDO_VALIDACAO" : "PENDENTE";
          await tx.acao.update({
            where: { id: gerada.o_acao_id },
            data: { status: andamento, percentual: PERCENTUAL[andamento] - (andamento === "EM_ANDAMENTO" ? 20 : 0), criadoEm: quando, atualizadoEm: quando },
          });
          contar(ctx, "acoes");
          log(ctx, { acao: "acao.criada", usuarioId: ctx.controlador.id, entidade: "Acao", entidadeId: gerada.o_acao_id, dados: { recomendacaoId: r.id, planoId: gerada.o_plano_id }, criadoEm: quando });
        }
      }
    }

    if (a.solicitacao) {
      await criarDemanda(ctx, { ...a.solicitacao, unidade: a.item.unidade, auditoriaId: auditoria.id });
    }
  }
}

// ───────────────────────── Execução ─────────────────────────

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!, options: "-c TimeZone=UTC" }) });

async function resolverClientes(): Promise<ClienteAlvo[]> {
  const select = { id: true, nome: true, tipo: true, municipio: true, uf: true } as const;
  const alvos: ClienteAlvo[] = [];
  const filtro = values.cliente?.trim();
  if (filtro) {
    const digitos = filtro.replace(/\D/g, "");
    const porId = /^[0-9a-f-]{36}$/i.test(filtro) ? await prisma.cliente.findUnique({ where: { id: filtro }, select }) : null;
    const encontrados = porId
      ? [porId]
      : await prisma.cliente.findMany({
          where: { OR: [{ nome: { contains: filtro, mode: "insensitive" } }, ...(digitos.length === 14 ? [{ cnpj: digitos }] : [])] },
          select,
        });
    if (encontrados.length !== 1) {
      const lista = encontrados.map((c) => `  - ${c.nome} (${c.id})`).join("\n");
      throw new Error(encontrados.length ? `"${filtro}" corresponde a mais de um cliente; use o id:\n${lista}` : `Cliente "${filtro}" não encontrado.`);
    }
    alvos.push(encontrados[0]);
  } else {
    alvos.push(await garantirClienteReal("PREFEITURA"));
  }
  if (values.camara && !alvos.some((c) => c.tipo === "CAMARA")) alvos.push(await garantirClienteReal("CAMARA"));
  return alvos;
}

async function garantirClienteReal(tipo: "PREFEITURA" | "CAMARA"): Promise<ClienteAlvo> {
  const { nome, cnpj } = CLIENTES_REAIS[tipo];
  const existente = await prisma.cliente.findUnique({ where: { cnpj }, select: { id: true, nome: true, tipo: true, municipio: true, uf: true, codigoIbge: true, populacao: true } });
  if (existente) {
    if (!existente.codigoIbge || !existente.populacao) {
      await prisma.cliente.update({ where: { id: existente.id }, data: { codigoIbge: existente.codigoIbge ?? CATOLANDIA.codigoIbge, populacao: existente.populacao ?? CATOLANDIA.populacao } });
    }
    return existente;
  }
  const criado = await prisma.cliente.create({ data: { nome, cnpj, tipo, ...CATOLANDIA }, select: { id: true, nome: true, tipo: true, municipio: true, uf: true } });
  await prisma.logAuditoria.create({ data: { acao: "admin.cliente.criado", entidade: "Cliente", entidadeId: criado.id, dados: { nome, cnpj, origem: "demo:popular" } } });
  console.log(`Cliente criado: ${nome} (CNPJ ${cnpj}).`);
  return criado;
}

async function popular(cliente: ClienteAlvo, senhaHash: string, vincularId: string | undefined) {
  const modelo = cliente.tipo === "CAMARA" ? CAMARA : PREFEITURA;
  return prisma.$transaction(
    async (tx) => {
      const ctx: Ctx = {
        tx,
        cliente,
        modelo,
        unidades: new Map(),
        controlador: undefined as unknown as Pessoa,
        equipe: [],
        satelites: new Map(),
        pessoas: [],
        logs: [],
        criados: {},
      };
      await criarUnidades(ctx);
      await criarEquipe(ctx, senhaHash);

      const modelosCriados = await criarModelosBase(tx, cliente.id);
      if (modelosCriados) {
        contar(ctx, "modelosChecklist", modelosCriados);
        log(ctx, { acao: "modelo_checklist.base_criados", usuarioId: ctx.controlador.id, dados: { criados: modelosCriados }, criadoEm: instanteAno(1, 15, 10) });
      }

      const ciclos = await autoavaliacao(ctx);
      const { acaoPortal } = await planos(ctx, ciclos);
      await auditorias(ctx);
      await demandas(ctx, ciclos, acaoPortal);
      await medidas(ctx);

      if (vincularId) {
        const atual = await tx.vinculoCliente.findUnique({ where: { usuarioId_clienteId: { usuarioId: vincularId, clienteId: cliente.id } }, select: { perfil: true, ativo: true } });
        if (!atual || atual.perfil !== "CONTROLADOR" || !atual.ativo) {
          const v = await tx.vinculoCliente.upsert({
            where: { usuarioId_clienteId: { usuarioId: vincularId, clienteId: cliente.id } },
            create: { usuarioId: vincularId, clienteId: cliente.id, perfil: "CONTROLADOR", cargo: "Administrador HorizonAJ" },
            update: { perfil: "CONTROLADOR", ativo: true },
            select: { id: true },
          });
          contar(ctx, "vinculos");
          log(ctx, { acao: "admin.vinculo.salvo", usuarioId: null, entidade: "VinculoCliente", entidadeId: v.id, dados: { usuario: values.vincular!, perfil: "CONTROLADOR", origem: "demo:popular" }, criadoEm: new Date() });
        }
      }

      if (Object.keys(ctx.criados).length) {
        log(ctx, { acao: "demo.populado", usuarioId: null, entidade: "Cliente", entidadeId: cliente.id, dados: { script: "demo:popular", criados: ctx.criados }, criadoEm: new Date() });
      }
      ctx.logs.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
      if (ctx.logs.length) {
        await tx.logAuditoria.createMany({ data: ctx.logs.map((l) => ({ ...l, clienteId: cliente.id })) });
        contar(ctx, "logs", ctx.logs.length);
      }
      return { criados: ctx.criados, pessoas: ctx.pessoas };
    },
    { timeout: 600_000, maxWait: 15_000 },
  );
}

async function main() {
  const senha = values.senha;
  if (!senha) throw new Error("Informe --senha (senha dos usuários de demonstração criados).");
  if (senha.length < 8) throw new Error("A senha deve ter ao menos 8 caracteres.");

  let vincularId: string | undefined;
  if (values.vincular) {
    const email = values.vincular.trim().toLowerCase();
    const u = await prisma.usuario.findUnique({ where: { email }, select: { id: true } });
    if (!u) throw new Error(`Usuário ${email} não encontrado para --vincular.`);
    vincularId = u.id;
  }

  const senhaHash = await hash(senha, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const clientes = await resolverClientes();
  for (const cliente of clientes) {
    const { criados, pessoas } = await popular(cliente, senhaHash, vincularId);
    console.log(`\n${cliente.nome} (${cliente.id})`);
    const itens = Object.entries(criados);
    console.log(itens.length ? `  Criados: ${itens.map(([k, v]) => `${k}=${v}`).join(", ")}` : "  Nada novo: o cliente já estava populado.");
    console.log("  Logins:");
    for (const p of pessoas) console.log(`    ${p.email.padEnd(58)} ${p.perfil.padEnd(11)} ${p.cargo}${p.nova ? "" : " (já existia; senha mantida)"}`);
  }
  console.log("\nSenha dos usuários novos: a informada em --senha.");
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
