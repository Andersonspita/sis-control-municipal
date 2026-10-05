-- Demandas, tramitação e documentos: comentários internos e restrições de escrita do satélite.

-- AlterTable
ALTER TABLE "tramitacoes_demanda" ADD COLUMN "interno" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "documentos_tramite_id_idx" ON "documentos"("tramite_id");

-- Leitura pelo satélite: sem trâmites internos e sem documentos anexados a eles.
DROP POLICY satelite_tramites ON tramitacoes_demanda;
CREATE POLICY satelite_tramites ON tramitacoes_demanda AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR (NOT interno AND demanda_id IN (SELECT id FROM demandas)));

DROP POLICY satelite_documentos ON documentos;
CREATE POLICY satelite_documentos ON documentos AS RESTRICTIVE
  USING (
    NOT app_eh_satelite() OR (
      demanda_id IN (SELECT id FROM demandas)
      AND (tramite_id IS NULL OR tramite_id IN (SELECT id FROM tramitacoes_demanda))
    )
  );

-- Escrita pelo satélite: só visualização, resposta e pedido de prorrogação, sempre em nome próprio.
CREATE POLICY satelite_tramites_inserir ON tramitacoes_demanda AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    NOT app_eh_satelite() OR (
      tipo IN ('VISUALIZACAO', 'RESPOSTA', 'PRORROGACAO_SOLICITADA')
      AND usuario_id = app_usuario_id()
      AND NOT interno
    )
  );

CREATE POLICY satelite_demandas_inserir ON demandas AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_eh_satelite());

CREATE POLICY satelite_demandas_excluir ON demandas AS RESTRICTIVE FOR DELETE
  USING (NOT app_eh_satelite());

CREATE POLICY satelite_documentos_inserir ON documentos AS RESTRICTIVE FOR INSERT
  WITH CHECK (NOT app_eh_satelite() OR (enviado_por_id = app_usuario_id() AND tramite_id IS NOT NULL));

CREATE POLICY satelite_documentos_alterar ON documentos AS RESTRICTIVE FOR UPDATE
  USING (NOT app_eh_satelite());

CREATE POLICY satelite_documentos_excluir ON documentos AS RESTRICTIVE FOR DELETE
  USING (NOT app_eh_satelite());

-- O satélite só altera a situação da demanda (visualizada ou respondida); demais campos são da controladoria.
CREATE OR REPLACE FUNCTION demandas_restringir_satelite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app_eh_satelite() THEN
    IF (NEW.cliente_id, NEW.numero, NEW.ano, NEW.assunto, NEW.descricao, NEW.unidade_destino_id,
        NEW.acao_id, NEW.prazo, NEW.prioridade, NEW.criado_por_id, NEW.criado_em)
       IS DISTINCT FROM
       (OLD.cliente_id, OLD.numero, OLD.ano, OLD.assunto, OLD.descricao, OLD.unidade_destino_id,
        OLD.acao_id, OLD.prazo, OLD.prioridade, OLD.criado_por_id, OLD.criado_em)
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

CREATE TRIGGER demandas_restricao_satelite
  BEFORE UPDATE ON demandas
  FOR EACH ROW EXECUTE FUNCTION demandas_restringir_satelite();
