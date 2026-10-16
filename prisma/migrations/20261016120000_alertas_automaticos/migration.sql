-- Alertas automáticos: a coleta do SICONFI cria, atualiza e encerra situações (origem ALERTA) sem ação do controlador.

ALTER TABLE "situacoes" ALTER COLUMN "criado_por_id" DROP NOT NULL;
ALTER TABLE "situacoes" ADD COLUMN "chave_automatica" VARCHAR(40);
ALTER TABLE "situacoes" ADD COLUMN "referencia_automatica" VARCHAR(500);

-- Só alertas automáticos ficam sem autor, e só a origem ALERTA tem chave automática.
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_autor_ou_automatica" CHECK ("criado_por_id" IS NOT NULL OR "chave_automatica" IS NOT NULL);
ALTER TABLE "situacoes" ADD CONSTRAINT "situacoes_chave_automatica_origem" CHECK ("chave_automatica" IS NULL OR "origem" = 'ALERTA');

-- No máximo um alerta automático em aberto por indicador e cliente.
CREATE UNIQUE INDEX "situacoes_automatica_aberta_key" ON "situacoes" ("cliente_id", "chave_automatica")
  WHERE "chave_automatica" IS NOT NULL AND "status" IN ('ABERTA', 'EM_TRATAMENTO');
