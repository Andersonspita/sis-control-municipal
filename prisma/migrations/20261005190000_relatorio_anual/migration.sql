-- Relatório Anual de Controle Interno (art. 17 da Res. TCM-BA 1.120/2005): textos editáveis por cliente e ano.

-- CreateTable
CREATE TABLE "relatorios_anuais" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "ano" INTEGER NOT NULL,
    "secoes" JSONB NOT NULL DEFAULT '{}',
    "atualizado_por_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "emitido_em" TIMESTAMPTZ(3),

    CONSTRAINT "relatorios_anuais_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "relatorios_anuais_cliente_id_ano_key" ON "relatorios_anuais"("cliente_id", "ano");

-- AddForeignKey
ALTER TABLE "relatorios_anuais" ADD CONSTRAINT "relatorios_anuais_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "relatorios_anuais" ADD CONSTRAINT "relatorios_anuais_ano_faixa" CHECK ("ano" BETWEEN 2000 AND 2100);
ALTER TABLE "relatorios_anuais" ADD CONSTRAINT "relatorios_anuais_secoes_objeto" CHECK (jsonb_typeof("secoes") = 'object');

-- Isolamento por cliente (mesmo padrão de *_rls).
ALTER TABLE relatorios_anuais ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorios_anuais FORCE ROW LEVEL SECURITY;

CREATE POLICY isolamento_cliente ON relatorios_anuais
  USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id());

-- Documento interno da controladoria: o satélite não lê nem grava.
CREATE POLICY satelite_relatorios_anuais ON relatorios_anuais AS RESTRICTIVE
  USING (NOT app_eh_satelite()) WITH CHECK (NOT app_eh_satelite());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE ON relatorios_anuais TO controladoria_app;
  END IF;
END $$;
