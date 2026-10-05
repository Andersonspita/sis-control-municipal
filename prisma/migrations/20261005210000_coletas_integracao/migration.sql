-- Integrações com APIs públicas (IBGE, SICONFI/Tesouro, Portal da Transparência da CGU).
-- Guarda a última coleta de cada fonte por cliente, para as telas não dependerem das APIs ao abrir.

-- CreateEnum
CREATE TYPE "FonteIntegracao" AS ENUM ('IBGE', 'SICONFI', 'PORTAL_TRANSPARENCIA');

-- CreateEnum
CREATE TYPE "StatusColeta" AS ENUM ('PROCESSANDO', 'SUCESSO', 'SEM_DADOS', 'DESABILITADA', 'ERRO');

-- CreateTable
CREATE TABLE "coletas_integracao" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "fonte" "FonteIntegracao" NOT NULL,
    "referencia" VARCHAR(60),
    "status" "StatusColeta" NOT NULL DEFAULT 'PROCESSANDO',
    "dados" JSONB,
    "erro" TEXT,
    "solicitado_por_id" UUID,
    "iniciado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "coletado_em" TIMESTAMPTZ(3),
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coletas_integracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coletas_integracao_cliente_id_fonte_key" ON "coletas_integracao"("cliente_id", "fonte");

-- AddForeignKey
ALTER TABLE "coletas_integracao" ADD CONSTRAINT "coletas_integracao_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolamento por cliente (mesmo padrão de *_rls).
ALTER TABLE coletas_integracao ENABLE ROW LEVEL SECURITY;
ALTER TABLE coletas_integracao FORCE ROW LEVEL SECURITY;

CREATE POLICY isolamento_cliente ON coletas_integracao
  USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id());

-- Dado interno da controladoria: o satélite não lê nem grava coletas.
CREATE POLICY satelite_coletas_integracao ON coletas_integracao AS RESTRICTIVE
  USING (NOT app_eh_satelite()) WITH CHECK (NOT app_eh_satelite());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON coletas_integracao TO controladoria_app;
  END IF;
END $$;
