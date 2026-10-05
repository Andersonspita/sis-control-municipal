-- Auditorias: PAAI, auditorias com matriz de planejamento, checklists, achados (padrão TCU) e recomendações.
-- Papéis de trabalho: visíveis só para a controladoria (o satélite só recebe as solicitações, que são demandas).

-- CreateEnum
CREATE TYPE "TipoAuditoria" AS ENUM ('CONFORMIDADE', 'OPERACIONAL', 'FINANCEIRA', 'GESTAO', 'ESPECIAL');

-- CreateEnum
CREATE TYPE "StatusPlanoAuditoria" AS ENUM ('RASCUNHO', 'APROVADO');

-- CreateEnum
CREATE TYPE "StatusAuditoria" AS ENUM (
  'PLANEJAMENTO', 'EXECUCAO', 'RELATORIO_PRELIMINAR', 'MANIFESTACAO', 'RELATORIO_FINAL', 'MONITORAMENTO', 'ENCERRADA', 'CANCELADA'
);

-- CreateEnum
CREATE TYPE "ResultadoItemChecklist" AS ENUM ('CONFORME', 'NAO_CONFORME', 'PARCIAL', 'NAO_APLICAVEL');

-- CreateTable
CREATE TABLE "planos_anuais_auditoria" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "ano" INTEGER NOT NULL,
    "status" "StatusPlanoAuditoria" NOT NULL DEFAULT 'RASCUNHO',
    "observacoes" TEXT,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "aprovado_por_id" UUID,
    "aprovado_em" TIMESTAMPTZ(3),

    CONSTRAINT "planos_anuais_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_plano_auditoria" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoAuditoria" NOT NULL,
    "unidade_id" UUID,
    "objetivo" TEXT,
    "probabilidade" INTEGER NOT NULL,
    "impacto" INTEGER NOT NULL,
    "mes_inicio" INTEGER NOT NULL,
    "mes_fim" INTEGER NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "itens_plano_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoAuditoria" NOT NULL,
    "objetivo" TEXT NOT NULL,
    "escopo" TEXT,
    "unidade_id" UUID,
    "criterios" TEXT,
    "equipe_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "item_plano_id" UUID,
    "inicio_previsto" DATE,
    "fim_previsto" DATE,
    "status" "StatusAuditoria" NOT NULL DEFAULT 'PLANEJAMENTO',
    "justificativa_cancelamento" TEXT,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "auditorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questoes_auditoria" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "auditoria_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "questao" TEXT NOT NULL,
    "informacoes" TEXT,
    "fontes" TEXT,
    "procedimentos" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questoes_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modelos_checklist" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoAuditoria",
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "modelos_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_checklist" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "modelo_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "texto" TEXT NOT NULL,
    "orientacao" TEXT,

    CONSTRAINT "itens_checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklists_auditoria" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "auditoria_id" UUID NOT NULL,
    "modelo_id" UUID,
    "nome" TEXT NOT NULL,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklists_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "itens_checklist_auditoria" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "checklist_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "texto" TEXT NOT NULL,
    "orientacao" TEXT,
    "resultado" "ResultadoItemChecklist",
    "observacao" TEXT,
    "avaliado_por_id" UUID,
    "avaliado_em" TIMESTAMPTZ(3),

    CONSTRAINT "itens_checklist_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achados" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "auditoria_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "condicao" TEXT NOT NULL,
    "criterio" TEXT NOT NULL,
    "causa" TEXT NOT NULL,
    "efeito" TEXT NOT NULL,
    "probabilidade" INTEGER NOT NULL,
    "impacto" INTEGER NOT NULL,
    "item_checklist_id" UUID,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "achados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recomendacoes" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "achado_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "unidade_id" UUID,
    "prazo" DATE,
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recomendacoes_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "planos_acao" ADD COLUMN "auditoria_id" UUID;

-- AlterTable
ALTER TABLE "acoes" ADD COLUMN "recomendacao_id" UUID;

-- AlterTable
ALTER TABLE "demandas" ADD COLUMN "auditoria_id" UUID;

-- AlterTable
ALTER TABLE "documentos" ADD COLUMN "auditoria_id" UUID,
ADD COLUMN "item_auditoria_id" UUID,
ADD COLUMN "achado_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "planos_anuais_auditoria_cliente_id_ano_key" ON "planos_anuais_auditoria"("cliente_id", "ano");
CREATE INDEX "itens_plano_auditoria_cliente_id_idx" ON "itens_plano_auditoria"("cliente_id");
CREATE INDEX "itens_plano_auditoria_plano_id_idx" ON "itens_plano_auditoria"("plano_id");
CREATE UNIQUE INDEX "auditorias_item_plano_id_key" ON "auditorias"("item_plano_id");
CREATE UNIQUE INDEX "auditorias_cliente_id_ano_numero_key" ON "auditorias"("cliente_id", "ano", "numero");
CREATE INDEX "auditorias_cliente_id_status_idx" ON "auditorias"("cliente_id", "status");
CREATE INDEX "auditorias_unidade_id_idx" ON "auditorias"("unidade_id");
CREATE INDEX "questoes_auditoria_auditoria_id_idx" ON "questoes_auditoria"("auditoria_id");
CREATE UNIQUE INDEX "modelos_checklist_cliente_id_nome_key" ON "modelos_checklist"("cliente_id", "nome");
CREATE INDEX "itens_checklist_modelo_id_idx" ON "itens_checklist"("modelo_id");
CREATE INDEX "checklists_auditoria_cliente_id_idx" ON "checklists_auditoria"("cliente_id");
CREATE UNIQUE INDEX "checklists_auditoria_auditoria_id_modelo_id_key" ON "checklists_auditoria"("auditoria_id", "modelo_id");
CREATE INDEX "itens_checklist_auditoria_checklist_id_idx" ON "itens_checklist_auditoria"("checklist_id");
CREATE INDEX "achados_cliente_id_idx" ON "achados"("cliente_id");
CREATE UNIQUE INDEX "achados_auditoria_id_numero_key" ON "achados"("auditoria_id", "numero");
CREATE INDEX "recomendacoes_cliente_id_idx" ON "recomendacoes"("cliente_id");
CREATE UNIQUE INDEX "recomendacoes_achado_id_numero_key" ON "recomendacoes"("achado_id", "numero");
CREATE UNIQUE INDEX "planos_acao_auditoria_id_key" ON "planos_acao"("auditoria_id");
CREATE UNIQUE INDEX "acoes_recomendacao_id_key" ON "acoes"("recomendacao_id");
CREATE INDEX "demandas_auditoria_id_idx" ON "demandas"("auditoria_id");
CREATE INDEX "documentos_auditoria_id_idx" ON "documentos"("auditoria_id");
CREATE INDEX "documentos_item_auditoria_id_idx" ON "documentos"("item_auditoria_id");
CREATE INDEX "documentos_achado_id_idx" ON "documentos"("achado_id");

-- AddForeignKey
ALTER TABLE "planos_anuais_auditoria" ADD CONSTRAINT "planos_anuais_auditoria_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itens_plano_auditoria" ADD CONSTRAINT "itens_plano_auditoria_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos_anuais_auditoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itens_plano_auditoria" ADD CONSTRAINT "itens_plano_auditoria_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_item_plano_id_fkey" FOREIGN KEY ("item_plano_id") REFERENCES "itens_plano_auditoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "questoes_auditoria" ADD CONSTRAINT "questoes_auditoria_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "modelos_checklist" ADD CONSTRAINT "modelos_checklist_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "itens_checklist" ADD CONSTRAINT "itens_checklist_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelos_checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklists_auditoria" ADD CONSTRAINT "checklists_auditoria_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklists_auditoria" ADD CONSTRAINT "checklists_auditoria_modelo_id_fkey" FOREIGN KEY ("modelo_id") REFERENCES "modelos_checklist"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "itens_checklist_auditoria" ADD CONSTRAINT "itens_checklist_auditoria_checklist_id_fkey" FOREIGN KEY ("checklist_id") REFERENCES "checklists_auditoria"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achados" ADD CONSTRAINT "achados_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditorias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "achados" ADD CONSTRAINT "achados_item_checklist_id_fkey" FOREIGN KEY ("item_checklist_id") REFERENCES "itens_checklist_auditoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recomendacoes" ADD CONSTRAINT "recomendacoes_achado_id_fkey" FOREIGN KEY ("achado_id") REFERENCES "achados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recomendacoes" ADD CONSTRAINT "recomendacoes_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_recomendacao_id_fkey" FOREIGN KEY ("recomendacao_id") REFERENCES "recomendacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_auditoria_id_fkey" FOREIGN KEY ("auditoria_id") REFERENCES "auditorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_item_auditoria_id_fkey" FOREIGN KEY ("item_auditoria_id") REFERENCES "itens_checklist_auditoria"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_achado_id_fkey" FOREIGN KEY ("achado_id") REFERENCES "achados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Regras de integridade (risco = probabilidade × impacto, cada um de 1 a 5; ver src/lib/risco.ts).
ALTER TABLE "itens_plano_auditoria" ADD CONSTRAINT "itens_plano_auditoria_probabilidade_faixa" CHECK ("probabilidade" BETWEEN 1 AND 5);
ALTER TABLE "itens_plano_auditoria" ADD CONSTRAINT "itens_plano_auditoria_impacto_faixa" CHECK ("impacto" BETWEEN 1 AND 5);
ALTER TABLE "itens_plano_auditoria" ADD CONSTRAINT "itens_plano_auditoria_periodo" CHECK ("mes_inicio" BETWEEN 1 AND 12 AND "mes_fim" BETWEEN "mes_inicio" AND 12);
ALTER TABLE "planos_anuais_auditoria" ADD CONSTRAINT "planos_anuais_auditoria_aprovacao" CHECK ("status" = 'RASCUNHO' OR "aprovado_em" IS NOT NULL);
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_periodo" CHECK ("fim_previsto" IS NULL OR "inicio_previsto" IS NULL OR "fim_previsto" >= "inicio_previsto");
ALTER TABLE "auditorias" ADD CONSTRAINT "auditorias_cancelamento" CHECK ("status" <> 'CANCELADA' OR "justificativa_cancelamento" IS NOT NULL);
ALTER TABLE "achados" ADD CONSTRAINT "achados_probabilidade_faixa" CHECK ("probabilidade" BETWEEN 1 AND 5);
ALTER TABLE "achados" ADD CONSTRAINT "achados_impacto_faixa" CHECK ("impacto" BETWEEN 1 AND 5);
ALTER TABLE "itens_checklist_auditoria" ADD CONSTRAINT "itens_checklist_auditoria_avaliacao" CHECK ("resultado" IS NULL OR "avaliado_em" IS NOT NULL);
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_origem_auditoria" CHECK ("auditoria_id" IS NULL OR "origem" = 'AUDITORIA');

-- Ciclo da auditoria (espelha TRANSICOES_AUDITORIA em src/lib/auditorias.ts).
CREATE OR REPLACE FUNCTION auditoria_transicao_valida(de "StatusAuditoria", para "StatusAuditoria") RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT (de::text, para::text) IN (
    ('PLANEJAMENTO', 'EXECUCAO'),
    ('EXECUCAO', 'PLANEJAMENTO'),
    ('EXECUCAO', 'RELATORIO_PRELIMINAR'),
    ('RELATORIO_PRELIMINAR', 'EXECUCAO'),
    ('RELATORIO_PRELIMINAR', 'MANIFESTACAO'),
    ('MANIFESTACAO', 'RELATORIO_PRELIMINAR'),
    ('MANIFESTACAO', 'RELATORIO_FINAL'),
    ('RELATORIO_FINAL', 'MONITORAMENTO'),
    ('RELATORIO_FINAL', 'ENCERRADA'),
    ('MONITORAMENTO', 'ENCERRADA'),
    ('PLANEJAMENTO', 'CANCELADA'),
    ('EXECUCAO', 'CANCELADA'),
    ('RELATORIO_PRELIMINAR', 'CANCELADA'),
    ('MANIFESTACAO', 'CANCELADA'),
    ('RELATORIO_FINAL', 'CANCELADA'),
    ('MONITORAMENTO', 'CANCELADA')
  );
$$;

CREATE OR REPLACE FUNCTION auditorias_validar_status() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'PLANEJAMENTO' THEN
      RAISE EXCEPTION 'Toda auditoria começa no planejamento' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NOT auditoria_transicao_valida(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Transição de auditoria inválida: % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auditorias_validar_status BEFORE INSERT OR UPDATE OF status ON auditorias
  FOR EACH ROW EXECUTE FUNCTION auditorias_validar_status();

-- Aplica um modelo de checklist à auditoria: copia os itens para a execução (RLS do chamador vale: SECURITY INVOKER).
CREATE OR REPLACE FUNCTION auditoria_aplicar_checklist(p_auditoria uuid, p_modelo uuid, p_usuario uuid) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_status "StatusAuditoria";
  v_cliente uuid;
  v_nome text;
  v_checklist uuid;
BEGIN
  SELECT status, cliente_id INTO v_status, v_cliente FROM auditorias WHERE id = p_auditoria FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auditoria não encontrada' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_status NOT IN ('PLANEJAMENTO', 'EXECUCAO') THEN
    RAISE EXCEPTION 'Checklists só podem ser aplicados no planejamento ou na execução' USING ERRCODE = 'check_violation';
  END IF;
  SELECT nome INTO v_nome FROM modelos_checklist WHERE id = p_modelo AND ativo;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo de checklist não encontrado ou inativo' USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM itens_checklist WHERE modelo_id = p_modelo) THEN
    RAISE EXCEPTION 'O modelo de checklist não tem itens' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM checklists_auditoria WHERE auditoria_id = p_auditoria AND modelo_id = p_modelo) THEN
    RAISE EXCEPTION 'Este modelo já foi aplicado à auditoria' USING ERRCODE = 'unique_violation';
  END IF;

  INSERT INTO checklists_auditoria (id, cliente_id, auditoria_id, modelo_id, nome, criado_por_id)
  VALUES (gen_random_uuid(), v_cliente, p_auditoria, p_modelo, v_nome, p_usuario)
  RETURNING id INTO v_checklist;

  INSERT INTO itens_checklist_auditoria (id, cliente_id, checklist_id, ordem, texto, orientacao)
  SELECT gen_random_uuid(), v_cliente, v_checklist, row_number() OVER (ORDER BY ordem, id), texto, orientacao
    FROM itens_checklist WHERE modelo_id = p_modelo;

  RETURN v_checklist;
END;
$$;

-- Gera (ou devolve, se já existir) a ação 5W2H de uma recomendação, no plano único da auditoria.
CREATE OR REPLACE FUNCTION recomendacao_gerar_acao(p_recomendacao uuid, p_usuario uuid)
RETURNS TABLE (o_acao_id uuid, o_plano_id uuid, o_criada boolean)
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  v_plano uuid;
  v_status_plano "StatusPlano";
  v_acao uuid;
BEGIN
  SELECT rec.id, rec.cliente_id, rec.texto, rec.unidade_id, rec.prazo,
         ach.numero AS achado_numero, ach.titulo AS achado_titulo, ach.probabilidade * ach.impacto AS pontuacao,
         a.id AS auditoria_id, a.numero, a.ano, a.titulo, a.status
    INTO r
    FROM recomendacoes rec
    JOIN achados ach ON ach.id = rec.achado_id
    JOIN auditorias a ON a.id = ach.auditoria_id
   WHERE rec.id = p_recomendacao
     FOR UPDATE OF a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recomendação não encontrada' USING ERRCODE = 'no_data_found';
  END IF;

  SELECT id, plano_id INTO v_acao, v_plano FROM acoes WHERE recomendacao_id = p_recomendacao;
  IF FOUND THEN
    RETURN QUERY SELECT v_acao, v_plano, false;
    RETURN;
  END IF;

  IF r.status IN ('PLANEJAMENTO', 'ENCERRADA', 'CANCELADA') THEN
    RAISE EXCEPTION 'A auditoria não admite gerar ações nesta etapa' USING ERRCODE = 'check_violation';
  END IF;

  SELECT id, status INTO v_plano, v_status_plano FROM planos_acao WHERE auditoria_id = r.auditoria_id;
  IF NOT FOUND THEN
    INSERT INTO planos_acao (id, cliente_id, auditoria_id, titulo, origem, status, criado_por_id)
    VALUES (gen_random_uuid(), r.cliente_id, r.auditoria_id,
            left(format('Auditoria %s/%s — %s', lpad(r.numero::text, 3, '0'), r.ano, r.titulo), 200),
            'AUDITORIA', 'EM_EXECUCAO', p_usuario)
    RETURNING id INTO v_plano;
  ELSIF v_status_plano = 'CANCELADO' THEN
    RAISE EXCEPTION 'O plano de ação da auditoria está cancelado' USING ERRCODE = 'check_violation';
  ELSIF v_status_plano <> 'EM_EXECUCAO' THEN
    UPDATE planos_acao SET status = 'EM_EXECUCAO' WHERE id = v_plano;
  END IF;

  INSERT INTO acoes (id, cliente_id, plano_id, recomendacao_id, unidade_responsavel_id, o_que, por_que, prazo, prioridade, atualizado_em)
  VALUES (gen_random_uuid(), r.cliente_id, v_plano, r.id, r.unidade_id, r.texto,
          left(format('Achado %s da auditoria %s/%s — %s', r.achado_numero, lpad(r.numero::text, 3, '0'), r.ano, r.achado_titulo), 2000),
          r.prazo,
          (CASE WHEN r.pontuacao >= 15 THEN 'URGENTE' WHEN r.pontuacao >= 10 THEN 'ALTA' WHEN r.pontuacao >= 6 THEN 'MEDIA' ELSE 'BAIXA' END)::"Prioridade",
          now())
  RETURNING id INTO v_acao;

  RETURN QUERY SELECT v_acao, v_plano, true;
END;
$$;

-- A origem "auditoria" da demanda também é campo da controladoria: o satélite não pode alterá-la.
CREATE OR REPLACE FUNCTION demandas_restringir_satelite() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF app_eh_satelite() THEN
    IF (NEW.cliente_id, NEW.numero, NEW.ano, NEW.assunto, NEW.descricao, NEW.unidade_destino_id,
        NEW.acao_id, NEW.resposta_requisito_id, NEW.auditoria_id, NEW.prazo, NEW.prioridade, NEW.criado_por_id, NEW.criado_em)
       IS DISTINCT FROM
       (OLD.cliente_id, OLD.numero, OLD.ano, OLD.assunto, OLD.descricao, OLD.unidade_destino_id,
        OLD.acao_id, OLD.resposta_requisito_id, OLD.auditoria_id, OLD.prazo, OLD.prioridade, OLD.criado_por_id, OLD.criado_em)
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

-- Isolamento por cliente e papéis de trabalho fora do alcance do satélite (anexos já são filtrados por
-- satelite_documentos, que só libera documentos de demandas da unidade dele).
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'planos_anuais_auditoria', 'itens_plano_auditoria', 'auditorias', 'questoes_auditoria', 'modelos_checklist',
    'itens_checklist', 'checklists_auditoria', 'itens_checklist_auditoria', 'achados', 'recomendacoes'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolamento_cliente ON %I USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id())', t);
    EXECUTE format(
      'CREATE POLICY satelite_%s ON %I AS RESTRICTIVE USING (NOT app_eh_satelite()) WITH CHECK (NOT app_eh_satelite())', t, t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO controladoria_app', t);
    END IF;
  END LOOP;
END $$;
