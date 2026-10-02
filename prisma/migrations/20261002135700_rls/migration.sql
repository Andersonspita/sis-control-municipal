-- Isolamento por cliente (Row Level Security).
-- A aplicação define, por transação: app.cliente_id, app.usuario_id e app.perfil.
-- Sem app.cliente_id definido, nenhuma linha das tabelas isoladas é visível.

CREATE OR REPLACE FUNCTION app_cliente_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.cliente_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_usuario_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.usuario_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app_perfil() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.perfil', true), '')
$$;

CREATE OR REPLACE FUNCTION app_eh_satelite() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_perfil() = 'SATELITE'
$$;

-- Unidades do escopo do satélite, incluindo as subordinadas.
-- SECURITY DEFINER para não depender das políticas de unidades/escopos (evita recursão);
-- o filtro por cliente e usuário é feito explicitamente.
CREATE OR REPLACE FUNCTION app_unidades_satelite() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE arvore AS (
    SELECT u.id
      FROM escopos_satelite e
      JOIN vinculos_cliente v ON v.id = e.vinculo_id
      JOIN unidades u ON u.id = e.unidade_id
     WHERE v.usuario_id = app_usuario_id()
       AND v.cliente_id = app_cliente_id()
       AND e.cliente_id = app_cliente_id()
       AND v.ativo
    UNION
    SELECT u.id FROM unidades u JOIN arvore a ON u.pai_id = a.id
     WHERE u.cliente_id = app_cliente_id()
  )
  SELECT id FROM arvore
$$;

REVOKE ALL ON FUNCTION app_unidades_satelite() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT EXECUTE ON FUNCTION app_unidades_satelite() TO controladoria_app;
  END IF;
END $$;

-- Política base de isolamento em todas as tabelas com cliente_id.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'unidades', 'escopos_satelite', 'ciclos_avaliacao', 'respostas_requisito',
    'planos_acao', 'acoes', 'demandas', 'tramitacoes_demanda', 'documentos'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolamento_cliente ON %I USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id())',
      t
    );
  END LOOP;
END $$;

-- Restrições adicionais para o perfil satélite (políticas RESTRICTIVE somam-se à base com AND).

CREATE POLICY satelite_unidades ON unidades AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR id IN (SELECT app_unidades_satelite()));

CREATE POLICY satelite_escopos ON escopos_satelite AS RESTRICTIVE
  USING (NOT app_eh_satelite());

CREATE POLICY satelite_ciclos ON ciclos_avaliacao AS RESTRICTIVE
  USING (NOT app_eh_satelite());

CREATE POLICY satelite_respostas ON respostas_requisito AS RESTRICTIVE
  USING (NOT app_eh_satelite());

CREATE POLICY satelite_acoes ON acoes AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR unidade_responsavel_id IN (SELECT app_unidades_satelite()));

CREATE POLICY satelite_planos ON planos_acao AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR id IN (SELECT plano_id FROM acoes));

CREATE POLICY satelite_demandas ON demandas AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR unidade_destino_id IN (SELECT app_unidades_satelite()));

CREATE POLICY satelite_tramites ON tramitacoes_demanda AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR demanda_id IN (SELECT id FROM demandas));

CREATE POLICY satelite_documentos ON documentos AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR demanda_id IN (SELECT id FROM demandas));

-- Trilha de auditoria: inserção com cliente atual ou sem cliente (ex.: login);
-- leitura apenas do cliente atual e nunca por satélite.
ALTER TABLE log_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE log_auditoria FORCE ROW LEVEL SECURITY;

CREATE POLICY log_inserir ON log_auditoria FOR INSERT
  WITH CHECK (cliente_id IS NULL OR cliente_id = app_cliente_id());

CREATE POLICY log_ler ON log_auditoria FOR SELECT
  USING (cliente_id = app_cliente_id() AND NOT app_eh_satelite());

-- Imutabilidade.
CREATE OR REPLACE FUNCTION bloquear_alteracao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registro imutável: % não permitido em %', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER log_auditoria_imutavel
  BEFORE UPDATE OR DELETE ON log_auditoria
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();

CREATE TRIGGER tramitacoes_imutavel
  BEFORE UPDATE OR DELETE ON tramitacoes_demanda
  FOR EACH ROW EXECUTE FUNCTION bloquear_alteracao();
