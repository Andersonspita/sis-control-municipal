-- Preferências de exibição por usuário (blocos do painel e seções recolhidas)
-- e texto padrão do Relatório Anual de Controle Interno por cliente.

ALTER TABLE "usuarios" ADD COLUMN "preferencias" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_preferencias_objeto" CHECK (jsonb_typeof("preferencias") = 'object');

-- CreateTable
CREATE TABLE "modelos_relatorio_anual" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "secoes" JSONB NOT NULL DEFAULT '{}',
    "atualizado_por_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modelos_relatorio_anual_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modelos_relatorio_anual_cliente_id_key" ON "modelos_relatorio_anual"("cliente_id");

-- AddForeignKey
ALTER TABLE "modelos_relatorio_anual" ADD CONSTRAINT "modelos_relatorio_anual_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "modelos_relatorio_anual" ADD CONSTRAINT "modelos_relatorio_anual_secoes_objeto" CHECK (jsonb_typeof("secoes") = 'object');

-- Isolamento por cliente (mesmo padrão de relatorios_anuais).
ALTER TABLE modelos_relatorio_anual ENABLE ROW LEVEL SECURITY;
ALTER TABLE modelos_relatorio_anual FORCE ROW LEVEL SECURITY;

CREATE POLICY isolamento_cliente ON modelos_relatorio_anual
  USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id());

-- Documento interno da controladoria: o satélite não lê nem grava.
CREATE POLICY satelite_modelos_relatorio_anual ON modelos_relatorio_anual AS RESTRICTIVE
  USING (NOT app_eh_satelite()) WITH CHECK (NOT app_eh_satelite());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE ON modelos_relatorio_anual TO controladoria_app;
  END IF;
END $$;
