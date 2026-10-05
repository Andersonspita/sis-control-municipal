-- IA para análise de documentos: extração mascarada, trechos com embeddings (pgvector),
-- fila de análises e sugestões pendentes de revisão humana.

CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "StatusExtracao" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDA', 'SEM_TEXTO', 'ERRO');

-- CreateEnum
CREATE TYPE "TipoAnaliseIA" AS ENUM ('COMPARAR_NORMA', 'AVALIAR_EVIDENCIA');

-- CreateEnum
CREATE TYPE "StatusAnaliseIA" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'ERRO');

-- CreateEnum
CREATE TYPE "StatusSugestaoIA" AS ENUM ('PENDENTE_REVISAO', 'ACEITA', 'EDITADA', 'REJEITADA');

-- CreateTable
CREATE TABLE "extracoes_documento" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "status" "StatusExtracao" NOT NULL DEFAULT 'PENDENTE',
    "paginas" INTEGER,
    "caracteres" INTEGER,
    "mascaramentos" JSONB,
    "modelo_embeddings" VARCHAR(100),
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMPTZ(3),

    CONSTRAINT "extracoes_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trechos_documento" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "documento_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "pagina" INTEGER,
    "posicao" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "embedding" vector(1536),

    CONSTRAINT "trechos_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analises_ia" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "tipo" "TipoAnaliseIA" NOT NULL,
    "status" "StatusAnaliseIA" NOT NULL DEFAULT 'PENDENTE',
    "solicitado_por_id" UUID NOT NULL,
    "documento_ids" UUID[],
    "ciclo_id" UUID,
    "resposta_requisito_id" UUID,
    "provedor" VARCHAR(20) NOT NULL,
    "modelo" VARCHAR(100),
    "modelo_embeddings" VARCHAR(100),
    "tokens_entrada" INTEGER NOT NULL DEFAULT 0,
    "tokens_saida" INTEGER NOT NULL DEFAULT 0,
    "tokens_embeddings" INTEGER NOT NULL DEFAULT 0,
    "custo_usd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "resumo" JSONB,
    "erro" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciado_em" TIMESTAMPTZ(3),
    "concluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "analises_ia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sugestoes_ia" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "analise_id" UUID NOT NULL,
    "resposta_requisito_id" UUID,
    "status" "StatusSugestaoIA" NOT NULL DEFAULT 'PENDENTE_REVISAO',
    "conteudo" JSONB NOT NULL,
    "conteudo_aplicado" JSONB,
    "citacoes" JSONB NOT NULL,
    "citacoes_descartadas" INTEGER NOT NULL DEFAULT 0,
    "revisado_por_id" UUID,
    "revisado_em" TIMESTAMPTZ(3),
    "motivo_rejeicao" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sugestoes_ia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "extracoes_documento_documento_id_key" ON "extracoes_documento"("documento_id");
CREATE INDEX "extracoes_documento_cliente_id_idx" ON "extracoes_documento"("cliente_id");
CREATE UNIQUE INDEX "trechos_documento_documento_id_ordem_key" ON "trechos_documento"("documento_id", "ordem");
CREATE INDEX "trechos_documento_cliente_id_idx" ON "trechos_documento"("cliente_id");
CREATE INDEX "analises_ia_cliente_id_criado_em_idx" ON "analises_ia"("cliente_id", "criado_em");
CREATE INDEX "analises_ia_ciclo_id_idx" ON "analises_ia"("ciclo_id");
CREATE INDEX "sugestoes_ia_cliente_id_status_idx" ON "sugestoes_ia"("cliente_id", "status");
CREATE INDEX "sugestoes_ia_analise_id_idx" ON "sugestoes_ia"("analise_id");
CREATE INDEX "sugestoes_ia_resposta_requisito_id_idx" ON "sugestoes_ia"("resposta_requisito_id");
-- Busca por similaridade (distância de cosseno) entre o requisito e os trechos.
CREATE INDEX "trechos_documento_embedding_idx" ON "trechos_documento" USING hnsw ("embedding" vector_cosine_ops);

-- AddForeignKey
ALTER TABLE "extracoes_documento" ADD CONSTRAINT "extracoes_documento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "extracoes_documento" ADD CONSTRAINT "extracoes_documento_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trechos_documento" ADD CONSTRAINT "trechos_documento_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "trechos_documento" ADD CONSTRAINT "trechos_documento_documento_id_fkey" FOREIGN KEY ("documento_id") REFERENCES "documentos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analises_ia" ADD CONSTRAINT "analises_ia_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_analise_id_fkey" FOREIGN KEY ("analise_id") REFERENCES "analises_ia"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_resposta_requisito_id_fkey" FOREIGN KEY ("resposta_requisito_id") REFERENCES "respostas_requisito"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Regras de integridade.
ALTER TABLE "analises_ia" ADD CONSTRAINT "analises_ia_custo_positivo" CHECK ("custo_usd" >= 0);
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_revisao" CHECK (
  "status" = 'PENDENTE_REVISAO' OR ("revisado_por_id" IS NOT NULL AND "revisado_em" IS NOT NULL)
);
ALTER TABLE "sugestoes_ia" ADD CONSTRAINT "sugestoes_ia_aplicacao" CHECK (
  "status" NOT IN ('ACEITA', 'EDITADA') OR "conteudo_aplicado" IS NOT NULL
);

-- Isolamento por cliente + dado interno da controladoria (o satélite não lê nem grava).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['extracoes_documento', 'trechos_documento', 'analises_ia', 'sugestoes_ia'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolamento_cliente ON %I USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id())', t);
    EXECUTE format(
      'CREATE POLICY satelite_%s ON %I AS RESTRICTIVE USING (NOT app_eh_satelite()) WITH CHECK (NOT app_eh_satelite())', t, t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO controladoria_app', t);
    END IF;
  END LOOP;
END $$;

-- O limite mensal de gasto é global (soma de todos os clientes): o código do servidor sem contexto de
-- acesso (mesmo critério de configuracoes_ia) pode ler as análises para somar o custo do mês.
CREATE POLICY analises_ia_gasto_global ON analises_ia FOR SELECT
  USING (app_perfil() IS NULL AND app_cliente_id() IS NULL);
