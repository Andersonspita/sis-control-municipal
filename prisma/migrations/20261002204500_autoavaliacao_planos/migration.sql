-- Autoavaliação (conclusão e congelamento do ciclo) e motor de planos de ação (prioridade e marcos).

-- AlterTable
ALTER TABLE "ciclos_avaliacao" ADD COLUMN     "concluido_em" TIMESTAMPTZ(3),
ADD COLUMN     "concluido_por_id" UUID;

-- AlterTable
ALTER TABLE "acoes" ADD COLUMN     "prioridade" "Prioridade" NOT NULL DEFAULT 'MEDIA';

-- CreateTable
CREATE TABLE "marcos_acao" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "acao_id" UUID NOT NULL,
    "descricao" TEXT NOT NULL,
    "prazo" DATE,
    "concluido_em" TIMESTAMPTZ(3),
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "marcos_acao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "marcos_acao_cliente_id_idx" ON "marcos_acao"("cliente_id");

-- CreateIndex
CREATE INDEX "marcos_acao_acao_id_idx" ON "marcos_acao"("acao_id");

-- AddForeignKey
ALTER TABLE "marcos_acao" ADD CONSTRAINT "marcos_acao_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "acoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Isolamento por cliente (mesmo padrão de *_rls).
ALTER TABLE marcos_acao ENABLE ROW LEVEL SECURITY;
ALTER TABLE marcos_acao FORCE ROW LEVEL SECURITY;

CREATE POLICY isolamento_cliente ON marcos_acao
  USING (cliente_id = app_cliente_id()) WITH CHECK (cliente_id = app_cliente_id());

-- Satélite só enxerga marcos das ações que ele já pode ver.
CREATE POLICY satelite_marcos ON marcos_acao AS RESTRICTIVE
  USING (NOT app_eh_satelite() OR acao_id IN (SELECT id FROM acoes));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON marcos_acao TO controladoria_app;
  END IF;
END $$;

-- Ciclo concluído (ou arquivado) congela as respostas: nenhuma inserção ou alteração.
CREATE OR REPLACE FUNCTION bloquear_resposta_ciclo_fechado() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_status "StatusCiclo";
BEGIN
  SELECT status INTO v_status FROM ciclos_avaliacao WHERE id = NEW.ciclo_id;
  IF v_status IS NOT NULL AND v_status <> 'EM_ANDAMENTO' THEN
    RAISE EXCEPTION 'Ciclo de avaliação encerrado: respostas congeladas (%).', TG_OP
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.ciclo_id <> NEW.ciclo_id THEN
    RAISE EXCEPTION 'Resposta não pode mudar de ciclo.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER respostas_ciclo_fechado
  BEFORE INSERT OR UPDATE ON respostas_requisito
  FOR EACH ROW EXECUTE FUNCTION bloquear_resposta_ciclo_fechado();

-- Um ciclo encerrado não volta a ficar em andamento.
CREATE OR REPLACE FUNCTION bloquear_reabertura_ciclo() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'EM_ANDAMENTO' AND NEW.status = 'EM_ANDAMENTO' THEN
    RAISE EXCEPTION 'Ciclo de avaliação encerrado não pode ser reaberto.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ciclos_sem_reabertura
  BEFORE UPDATE OF status ON ciclos_avaliacao
  FOR EACH ROW EXECUTE FUNCTION bloquear_reabertura_ciclo();
