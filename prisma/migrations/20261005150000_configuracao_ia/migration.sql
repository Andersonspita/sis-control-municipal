-- Configuração global da IA (OpenAI), linha única. A chave da API é gravada cifrada pela aplicação (AES-256-GCM).

-- CreateTable
CREATE TABLE "configuracoes_ia" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "habilitada" BOOLEAN NOT NULL DEFAULT false,
    "chave_cifrada" TEXT,
    "chave_final" VARCHAR(4),
    "modelo_texto" VARCHAR(100) NOT NULL DEFAULT 'gpt-4.1-mini',
    "modelo_embeddings" VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small',
    "limite_mensal_usd" DECIMAL(12,2),
    "alterado_por_id" UUID,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "configuracoes_ia_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "configuracoes_ia_linha_unica" CHECK ("id" = 1)
);

-- Leitura: código do servidor sem contexto de acesso (obterConfigIA, fora de comCliente) ou administrador.
-- Nenhum contexto de cliente (controlador, satélite etc.) enxerga a tabela, nem por engano.
-- Escrita: só o administrador HorizonAJ (conferido no banco por app_eh_admin).
ALTER TABLE configuracoes_ia ENABLE ROW LEVEL SECURITY;
ALTER TABLE configuracoes_ia FORCE ROW LEVEL SECURITY;

CREATE POLICY config_ia_ler ON configuracoes_ia FOR SELECT
  USING ((app_perfil() IS NULL AND app_cliente_id() IS NULL) OR app_eh_admin());
CREATE POLICY config_ia_inserir ON configuracoes_ia FOR INSERT
  WITH CHECK (app_eh_admin());
CREATE POLICY config_ia_alterar ON configuracoes_ia FOR UPDATE
  USING (app_eh_admin()) WITH CHECK (app_eh_admin());
CREATE POLICY config_ia_excluir ON configuracoes_ia FOR DELETE
  USING (app_eh_admin());

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON configuracoes_ia TO controladoria_app;
  END IF;
END $$;
