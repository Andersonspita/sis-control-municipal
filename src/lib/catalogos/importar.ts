import fs from "node:fs";
import { parse } from "yaml";
import { z } from "zod";
import type { Macrofuncao, PrismaClient, TipoCliente, TipoRequisito } from "@/generated/prisma/client";

const TODOS: TipoCliente[] = [
  "PREFEITURA",
  "CAMARA",
  "AUTARQUIA",
  "FUNDACAO",
  "CONSORCIO",
  "EMPRESA_PUBLICA",
  "OUTRO",
];

const aplicabilidade = z
  .union([z.enum(["todos", "executivo", "legislativo"]), z.array(z.enum(TODOS as [TipoCliente, ...TipoCliente[]]))])
  .optional();

const TIPOS_REQUISITO = { estrutural: "ESTRUTURAL", procedimental: "PROCEDIMENTAL", documental: "DOCUMENTAL" } as const;
const MACROFUNCOES = {
  auditoria_interna: "AUDITORIA_INTERNA",
  controladoria: "CONTROLADORIA",
  corregedoria: "CORREGEDORIA",
  ouvidoria: "OUVIDORIA",
  planejamento_orcamento: "PLANEJAMENTO_ORCAMENTO",
  contabilidade_financas: "CONTABILIDADE_FINANCAS",
  gestao_fiscal: "GESTAO_FISCAL",
  receita: "RECEITA",
  pessoal: "PESSOAL",
  patrimonio: "PATRIMONIO",
  licitacoes_contratos: "LICITACOES_CONTRATOS",
  obras: "OBRAS",
  transferencias: "TRANSFERENCIAS",
  transparencia: "TRANSPARENCIA",
} as const satisfies Record<string, Macrofuncao>;

const tipoRequisito = z.enum(Object.keys(TIPOS_REQUISITO) as [keyof typeof TIPOS_REQUISITO]);
const macrofuncao = z.enum(Object.keys(MACROFUNCOES) as [keyof typeof MACROFUNCOES]);

type RequisitoYaml = {
  codigo: string;
  titulo: string;
  descricao?: string;
  orientacao?: string;
  fundamento?: string;
  avaliavel?: boolean;
  aplicavel_a?: z.infer<typeof aplicabilidade>;
  tipo?: z.infer<typeof tipoRequisito>;
  peso?: number;
  macrofuncoes?: z.infer<typeof macrofuncao>[];
  periodicidade?: string;
  palavras_chave?: string[];
  filhos?: RequisitoYaml[];
};

const requisito: z.ZodType<RequisitoYaml> = z.lazy(() =>
  z.object({
    codigo: z.string().min(1),
    titulo: z.string().min(1),
    descricao: z.string().optional(),
    orientacao: z.string().optional(),
    fundamento: z.string().optional(),
    avaliavel: z.boolean().optional(),
    aplicavel_a: aplicabilidade,
    tipo: tipoRequisito.optional(),
    peso: z.int().min(1).max(10).optional(),
    macrofuncoes: z.array(macrofuncao).optional(),
    periodicidade: z.string().trim().min(1).optional(),
    palavras_chave: z.array(z.string().trim().min(1)).optional(),
    filhos: z.array(requisito).optional(),
  }),
);

/** Atributos herdados pelos filhos quando não declarados neles (palavras-chave se acumulam). */
type Heranca = {
  tipos: TipoCliente[];
  tipo: TipoRequisito | null;
  peso: number;
  macrofuncoes: Macrofuncao[];
  periodicidade: string | null;
  palavrasChave: string[];
};

const catalogo = z.object({
  norma: z.object({
    codigo: z.string(),
    versao: z.string(),
    titulo: z.string(),
    orgao_emissor: z.string(),
    data_publicacao: z.union([z.date(), z.string()]).optional(),
    fonte_url: z.string().optional(),
    descricao: z.string().optional(),
  }),
  aplicavel_a: aplicabilidade,
  requisitos: z.array(requisito).min(1),
});

function resolverTipos(valor: RequisitoYaml["aplicavel_a"], herdado: TipoCliente[]): TipoCliente[] {
  if (!valor) return herdado;
  if (valor === "todos") return TODOS;
  if (valor === "executivo") return TODOS.filter((t) => t !== "CAMARA");
  if (valor === "legislativo") return ["CAMARA"];
  return valor;
}

export type ResultadoImportacao = { norma: string; requisitos: number; avaliaveis: number };

export async function importarCatalogo(prisma: PrismaClient, arquivo: string): Promise<ResultadoImportacao> {
  const dados = catalogo.parse(parse(fs.readFileSync(arquivo, "utf8")));
  const { norma: n } = dados;
  const dataPublicacao = n.data_publicacao ? new Date(n.data_publicacao) : null;

  return prisma.$transaction(
    async (tx) => {
      const norma = await tx.norma.upsert({
        where: { codigo_versao: { codigo: n.codigo, versao: n.versao } },
        create: {
          codigo: n.codigo,
          versao: n.versao,
          titulo: n.titulo,
          orgaoEmissor: n.orgao_emissor,
          dataPublicacao,
          fonteUrl: n.fonte_url,
          descricao: n.descricao,
        },
        update: {
          titulo: n.titulo,
          orgaoEmissor: n.orgao_emissor,
          dataPublicacao,
          fonteUrl: n.fonte_url,
          descricao: n.descricao,
        },
      });

      let ordem = 0;
      let avaliaveis = 0;
      const codigos = new Set<string>();

      async function gravar(itens: RequisitoYaml[], paiId: string | null, pai: Heranca) {
        for (const item of itens) {
          if (codigos.has(item.codigo)) throw new Error(`Código duplicado no catálogo: ${item.codigo}`);
          codigos.add(item.codigo);
          const avaliavel = item.avaliavel ?? true;
          if (avaliavel) avaliaveis++;
          const heranca: Heranca = {
            tipos: resolverTipos(item.aplicavel_a, pai.tipos),
            tipo: item.tipo ? TIPOS_REQUISITO[item.tipo] : pai.tipo,
            peso: item.peso ?? pai.peso,
            macrofuncoes: item.macrofuncoes ? [...new Set(item.macrofuncoes.map((m) => MACROFUNCOES[m]))] : pai.macrofuncoes,
            periodicidade: item.periodicidade ?? pai.periodicidade,
            palavrasChave: [...new Set([...pai.palavrasChave, ...(item.palavras_chave ?? []).map((p) => p.toLowerCase())])],
          };
          const campos = {
            paiId,
            ordem: ordem++,
            titulo: item.titulo,
            descricao: item.descricao?.trim() ?? null,
            orientacao: item.orientacao ?? null,
            fundamento: item.fundamento ?? null,
            avaliavel,
            tiposEntidade: heranca.tipos,
            tipo: heranca.tipo,
            peso: heranca.peso,
            macrofuncoes: heranca.macrofuncoes,
            periodicidade: heranca.periodicidade,
            palavrasChave: heranca.palavrasChave,
          };
          const salvo = await tx.requisito.upsert({
            where: { normaId_codigo: { normaId: norma.id, codigo: item.codigo } },
            create: { normaId: norma.id, codigo: item.codigo, ...campos },
            update: campos,
          });
          if (item.filhos?.length) await gravar(item.filhos, salvo.id, heranca);
        }
      }

      await gravar(dados.requisitos, null, {
        tipos: resolverTipos(dados.aplicavel_a, TODOS),
        tipo: null,
        peso: 1,
        macrofuncoes: [],
        periodicidade: null,
        palavrasChave: [],
      });

      // Requisitos removidos do catálogo: apagar só se nunca foram respondidos.
      const orfaos = await tx.requisito.findMany({
        where: { normaId: norma.id, codigo: { notIn: [...codigos] } },
        select: { id: true, codigo: true, _count: { select: { respostas: true } } },
      });
      for (const o of orfaos) {
        if (o._count.respostas === 0) await tx.requisito.delete({ where: { id: o.id } });
        else console.warn(`Requisito ${o.codigo} saiu do catálogo mas tem respostas; mantido.`);
      }

      return { norma: `${n.codigo}/${n.versao}`, requisitos: codigos.size, avaliaveis };
    },
    { timeout: 120_000 },
  );
}
