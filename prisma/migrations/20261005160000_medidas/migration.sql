-- Medidas: situações que precisam de intervenção, com plano de ação geral e anexos.

-- CreateEnum
CREATE TYPE "OrigemSituacao" AS ENUM ('CONSTATACAO', 'DENUNCIA', 'ALERTA', 'ANALISE_IA', 'DEMANDA_EXTERNA');

-- CreateEnum
CREATE TYPE "StatusSituacao" AS ENUM ('ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'ARQUIVADA');

-- CreateTable
CREATE TABLE "situacoes" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "origem" "OrigemSituacao" NOT NULL,
    "unidade_id" UUID,
    "probabilidade" INTEGER NOT NULL,
    "impacto" INTEGER NOT NULL,
    "status" "StatusSituacao" NOT NULL DEFAULT 'ABERTA',
    "sigilosa" BOOLEAN NOT NULL DEFAULT false,
    "denunciante" TEXT,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "encerrado_por_id" UUID,
    "encerrado_em" TIMESTAMPTZ(3),
    "justificativa_encerramento" TEXT,

    CONSTRAINT "situacoes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "planos_acao" ADD COLUMN "situacao_id" UUID;

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN "situacao_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "situacoes_cliente_id_ano_numero_key" ON "situacoes"("cliente_id", "ano", "numero");

-- CreateIndex
CREATE INDEX "situacoes_cliente_id_status_idx" ON "situacoes"("cliente_id", "status");

-- CreateIndex
CREATE INDEX "situacoes_unidade_id_idx" ON "situacoes"("unidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "planos_acao_situacao_id_key" ON "planos_acao"("situacao_id");

-- CreateIndex
CREATE INDEX "documentos_situacao_id_idx" ON "documentos"("situacao_id");

-- AddForeignKey
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_situacao_id_fkey" FOREIGN KEY ("situacao_id") REFERENCES "situacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_situacao_id_fkey" FOREIGN KEY ("situacao_id") REFERENCES "situacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regras de integridade (a gravidade é probabilidade × impacto, cada um de 1 a 5).
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_probabilidade_faixa" CHECK ("probabilidade" BETWEEN 1 AND 5);
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_impacto_faixa" CHECK ("impacto" BETWEEN 1 AND 5);
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_sigilo_denuncia" CHECK (NOT "sigilosa" OR "origem" = 'DENUNCIA');
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_encerramento" CHECK (
  "status" NOT IN ('RESOLVIDA', 'ARQUIVADA')
  OR ("encerrado_em" IS NOT NULL AND "justificativa_encerramento" IS NOT NULL)
);
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_origem_situacao" CHECK ("situacao_id" IS NULL OR "origem" = 'MEDIDA');

-- Isolamento por cliente (mesmo padrão de *_rls).
ALTER TABLE situacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE situacoes FORCE ROW LEVEL SECURITY;

CREATE POLICY isolamento_cliente ON situacoes
  USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id());

-- Dado interno da controladoria: o satélite não lê nem grava situações
-- (ele só recebe as demandas geradas a partir das ações do plano).
CREATE POLICY satelite_situacoes ON situacoes AS RESTRICTIVE
  USING (NOT app_eh_satelite()) WITH CHECK (NOT app_eh_satelite());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON situacoes TO controladoria_app;
  END IF;
END $$;
