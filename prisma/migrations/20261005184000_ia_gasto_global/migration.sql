-- Sem contexto de acesso, app_eh_satelite() é NULL e a política restritiva barrava a soma global do
-- gasto (analises_ia_gasto_global). O satélite continua sem ler nem gravar análises.
DROP POLICY satelite_analises_ia ON analises_ia;
CREATE POLICY satelite_analises_ia ON analises_ia AS RESTRICTIVE
  USING (app_perfil() IS DISTINCT FROM 'SATELITE') WITH CHECK (app_perfil() IS DISTINCT FROM 'SATELITE');
