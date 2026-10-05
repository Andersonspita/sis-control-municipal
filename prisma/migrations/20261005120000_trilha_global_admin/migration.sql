-- Leitura da trilha global (registros sem cliente: login, falhas, administração) pelo administrador HorizonAJ.
-- A política log_ler só libera registros do cliente atual; sem esta, nenhum log sem cliente é legível pelo papel da aplicação.
-- O contexto de administração é: app.perfil = 'ADMIN_HORIZON', app.cliente_id vazio e app.usuario_id
-- apontando para um usuário ativo com admin_horizon (conferido no próprio banco, não só pela aplicação).

CREATE OR REPLACE FUNCTION app_eh_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app_perfil() = 'ADMIN_HORIZON'
     AND app_cliente_id() IS NULL
     AND EXISTS (SELECT 1 FROM usuarios WHERE id = app_usuario_id() AND admin_horizon AND ativo)
$$;

CREATE POLICY log_ler_admin ON log_auditoria FOR SELECT
  USING (cliente_id IS NULL AND app_eh_admin());
