-- Demanda gerada a partir de um requisito da autoavaliação: a resposta da unidade volta como evidência.
ALTER TABLE "demandas" ADD COLUMN "resposta_requisito_id" UUID;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_resposta_requisito_id_fkey"
  FOREIGN KEY ("resposta_requisito_id") REFERENCES "respostas_requisito"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "demandas_resposta_requisito_id_idx" ON "demandas"("resposta_requisito_id");
CREATE INDEX "demandas_acao_id_idx" ON "demandas"("acao_id");

-- O vínculo de origem também é campo da controladoria: o satélite não pode alterá-lo.
CREATE OR REPLACE FUNCTION demandas_restringir_satelite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app_eh_satelite() THEN
    IF (NEW.cliente_id, NEW.numero, NEW.ano, NEW.assunto, NEW.descricao, NEW.unidade_destino_id,
        NEW.acao_id, NEW.resposta_requisito_id, NEW.prazo, NEW.prioridade, NEW.criado_por_id, NEW.criado_em)
       IS DISTINCT FROM
       (OLD.cliente_id, OLD.numero, OLD.ano, OLD.assunto, OLD.descricao, OLD.unidade_destino_id,
        OLD.acao_id, OLD.resposta_requisito_id, OLD.prazo, OLD.prioridade, OLD.criado_por_id, OLD.criado_em)
    OR NOT (
         (NEW.status = OLD.status)
      OR (NEW.status = 'VISUALIZADA' AND OLD.status = 'ENVIADA')
      OR (NEW.status = 'RESPONDIDA' AND OLD.status IN ('ENVIADA', 'VISUALIZADA', 'DEVOLVIDA'))
    ) THEN
      RAISE EXCEPTION 'Perfil satélite só pode registrar a visualização ou a resposta da demanda'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
