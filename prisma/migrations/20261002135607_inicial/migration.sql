-- CreateEnum
CREATE TYPE "TipoCliente" AS ENUM ('PREFEITURA', 'CAMARA', 'AUTARQUIA', 'FUNDACAO', 'CONSORCIO', 'EMPRESA_PUBLICA', 'OUTRO');

-- CreateEnum
CREATE TYPE "Perfil" AS ENUM ('CONTROLADOR', 'EQUIPE', 'SATELITE');

-- CreateEnum
CREATE TYPE "TipoUnidade" AS ENUM ('ORGAO', 'SECRETARIA', 'DEPARTAMENTO', 'DIVISAO', 'SETOR', 'OUTRO');

-- CreateEnum
CREATE TYPE "StatusCiclo" AS ENUM ('EM_ANDAMENTO', 'CONCLUIDO', 'ARQUIVADO');

-- CreateEnum
CREATE TYPE "SituacaoRequisito" AS ENUM ('NAO_AVALIADO', 'ATENDIDO', 'PARCIALMENTE_ATENDIDO', 'NAO_ATENDIDO', 'NAO_APLICAVEL');

-- CreateEnum
CREATE TYPE "OrigemPlano" AS ENUM ('REQUISITO', 'AUDITORIA', 'MEDIDA', 'DETERMINACAO_TC', 'OUTRA');

-- CreateEnum
CREATE TYPE "StatusPlano" AS ENUM ('RASCUNHO', 'EM_EXECUCAO', 'CONCLUIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "StatusAcao" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'AGUARDANDO_VALIDACAO', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "StatusDemanda" AS ENUM ('ENVIADA', 'VISUALIZADA', 'RESPONDIDA', 'EM_ANALISE', 'DEVOLVIDA', 'CONCLUIDA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "Prioridade" AS ENUM ('BAIXA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateEnum
CREATE TYPE "TipoTramite" AS ENUM ('ENVIO', 'VISUALIZACAO', 'RESPOSTA', 'ANALISE', 'DEVOLUCAO', 'CONCLUSAO', 'CANCELAMENTO', 'PRORROGACAO_SOLICITADA', 'PRORROGACAO_DEFERIDA', 'PRORROGACAO_INDEFERIDA', 'COMENTARIO');

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCliente" NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "municipio" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "codigo_ibge" VARCHAR(7),
    "populacao" INTEGER,
    "brasao_key" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cpf" VARCHAR(11),
    "senha_hash" TEXT NOT NULL,
    "admin_horizon" BOOLEAN NOT NULL DEFAULT false,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_acesso_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessoes" (
    "id" VARCHAR(64) NOT NULL,
    "usuario_id" UUID NOT NULL,
    "cliente_ativo_id" UUID,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "ip" TEXT,
    "user_agent" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vinculos_cliente" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "perfil" "Perfil" NOT NULL,
    "cargo" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vinculos_cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unidades" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "pai_id" UUID,
    "nome" TEXT NOT NULL,
    "sigla" TEXT,
    "tipo" "TipoUnidade" NOT NULL DEFAULT 'SECRETARIA',
    "responsavel_nome" TEXT,
    "responsavel_email" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unidades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escopos_satelite" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "vinculo_id" UUID NOT NULL,
    "unidade_id" UUID NOT NULL,

    CONSTRAINT "escopos_satelite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normas" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "versao" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "orgao_emissor" TEXT NOT NULL,
    "data_publicacao" DATE,
    "fonte_url" TEXT,
    "descricao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "importado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "normas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requisitos" (
    "id" UUID NOT NULL,
    "norma_id" UUID NOT NULL,
    "pai_id" UUID,
    "codigo" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "orientacao" TEXT,
    "fundamento" TEXT,
    "avaliavel" BOOLEAN NOT NULL DEFAULT true,
    "tipos_entidade" "TipoCliente"[],

    CONSTRAINT "requisitos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ciclos_avaliacao" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "norma_id" UUID NOT NULL,
    "unidade_id" UUID,
    "nome" TEXT NOT NULL,
    "data_inicio" DATE NOT NULL,
    "data_fim" DATE,
    "status" "StatusCiclo" NOT NULL DEFAULT 'EM_ANDAMENTO',
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ciclos_avaliacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas_requisito" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "ciclo_id" UUID NOT NULL,
    "requisito_id" UUID NOT NULL,
    "situacao" "SituacaoRequisito" NOT NULL DEFAULT 'NAO_AVALIADO',
    "observacao" TEXT,
    "evidencia" TEXT,
    "respondido_por_id" UUID,
    "respondido_em" TIMESTAMPTZ(3),

    CONSTRAINT "respostas_requisito_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_acao" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "ciclo_id" UUID,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "origem" "OrigemPlano" NOT NULL,
    "status" "StatusPlano" NOT NULL DEFAULT 'RASCUNHO',
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planos_acao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acoes" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "plano_id" UUID NOT NULL,
    "resposta_requisito_id" UUID,
    "unidade_responsavel_id" UUID,
    "o_que" TEXT NOT NULL,
    "por_que" TEXT,
    "onde" TEXT,
    "prazo" DATE,
    "responsavel" TEXT,
    "como" TEXT,
    "custo_estimado" DECIMAL(14,2),
    "status" "StatusAcao" NOT NULL DEFAULT 'PENDENTE',
    "percentual" INTEGER NOT NULL DEFAULT 0,
    "validado_por_id" UUID,
    "validado_em" TIMESTAMPTZ(3),
    "parecer_validacao" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "acoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demandas" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "assunto" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade_destino_id" UUID NOT NULL,
    "acao_id" UUID,
    "prazo" DATE NOT NULL,
    "prioridade" "Prioridade" NOT NULL DEFAULT 'MEDIA',
    "status" "StatusDemanda" NOT NULL DEFAULT 'ENVIADA',
    "criado_por_id" UUID NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demandas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tramitacoes_demanda" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "demanda_id" UUID NOT NULL,
    "tipo" "TipoTramite" NOT NULL,
    "status_anterior" "StatusDemanda",
    "status_novo" "StatusDemanda",
    "texto" TEXT,
    "novo_prazo" DATE,
    "usuario_id" UUID NOT NULL,
    "usuario_nome" TEXT NOT NULL,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tramitacoes_demanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documentos" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "nome" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storage_key" TEXT NOT NULL,
    "enviado_por_id" UUID NOT NULL,
    "demanda_id" UUID,
    "tramite_id" UUID,
    "resposta_requisito_id" UUID,
    "acao_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_auditoria" (
    "id" BIGSERIAL NOT NULL,
    "cliente_id" UUID,
    "usuario_id" UUID,
    "acao" TEXT NOT NULL,
    "entidade" TEXT,
    "entidade_id" TEXT,
    "dados" JSONB,
    "ip" TEXT,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_cnpj_key" ON "clientes"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- CreateIndex
CREATE INDEX "sessoes_usuario_id_idx" ON "sessoes"("usuario_id");

-- CreateIndex
CREATE INDEX "vinculos_cliente_cliente_id_idx" ON "vinculos_cliente"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "vinculos_cliente_usuario_id_cliente_id_key" ON "vinculos_cliente"("usuario_id", "cliente_id");

-- CreateIndex
CREATE INDEX "unidades_cliente_id_idx" ON "unidades"("cliente_id");

-- CreateIndex
CREATE INDEX "escopos_satelite_cliente_id_idx" ON "escopos_satelite"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "escopos_satelite_vinculo_id_unidade_id_key" ON "escopos_satelite"("vinculo_id", "unidade_id");

-- CreateIndex
CREATE UNIQUE INDEX "normas_codigo_versao_key" ON "normas"("codigo", "versao");

-- CreateIndex
CREATE INDEX "requisitos_pai_id_idx" ON "requisitos"("pai_id");

-- CreateIndex
CREATE UNIQUE INDEX "requisitos_norma_id_codigo_key" ON "requisitos"("norma_id", "codigo");

-- CreateIndex
CREATE INDEX "ciclos_avaliacao_cliente_id_idx" ON "ciclos_avaliacao"("cliente_id");

-- CreateIndex
CREATE INDEX "respostas_requisito_cliente_id_idx" ON "respostas_requisito"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "respostas_requisito_ciclo_id_requisito_id_key" ON "respostas_requisito"("ciclo_id", "requisito_id");

-- CreateIndex
CREATE INDEX "planos_acao_cliente_id_idx" ON "planos_acao"("cliente_id");

-- CreateIndex
CREATE INDEX "acoes_cliente_id_idx" ON "acoes"("cliente_id");

-- CreateIndex
CREATE INDEX "acoes_plano_id_idx" ON "acoes"("plano_id");

-- CreateIndex
CREATE INDEX "demandas_cliente_id_status_idx" ON "demandas"("cliente_id", "status");

-- CreateIndex
CREATE INDEX "demandas_unidade_destino_id_idx" ON "demandas"("unidade_destino_id");

-- CreateIndex
CREATE UNIQUE INDEX "demandas_cliente_id_ano_numero_key" ON "demandas"("cliente_id", "ano", "numero");

-- CreateIndex
CREATE INDEX "tramitacoes_demanda_demanda_id_idx" ON "tramitacoes_demanda"("demanda_id");

-- CreateIndex
CREATE INDEX "tramitacoes_demanda_cliente_id_idx" ON "tramitacoes_demanda"("cliente_id");

-- CreateIndex
CREATE UNIQUE INDEX "documentos_storage_key_key" ON "documentos"("storage_key");

-- CreateIndex
CREATE INDEX "documentos_cliente_id_idx" ON "documentos"("cliente_id");

-- CreateIndex
CREATE INDEX "documentos_demanda_id_idx" ON "documentos"("demanda_id");

-- CreateIndex
CREATE INDEX "log_auditoria_cliente_id_criado_em_idx" ON "log_auditoria"("cliente_id", "criado_em");

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_cliente_ativo_id_fkey" FOREIGN KEY ("cliente_ativo_id") REFERENCES "clientes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_cliente" ADD CONSTRAINT "vinculos_cliente_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vinculos_cliente" ADD CONSTRAINT "vinculos_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unidades" ADD CONSTRAINT "unidades_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escopos_satelite" ADD CONSTRAINT "escopos_satelite_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escopos_satelite" ADD CONSTRAINT "escopos_satelite_vinculo_id_fkey" FOREIGN KEY ("vinculo_id") REFERENCES "vinculos_cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escopos_satelite" ADD CONSTRAINT "escopos_satelite_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitos" ADD CONSTRAINT "requisitos_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "normas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisitos" ADD CONSTRAINT "requisitos_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "requisitos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciclos_avaliacao" ADD CONSTRAINT "ciclos_avaliacao_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciclos_avaliacao" ADD CONSTRAINT "ciclos_avaliacao_norma_id_fkey" FOREIGN KEY ("norma_id") REFERENCES "normas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ciclos_avaliacao" ADD CONSTRAINT "ciclos_avaliacao_unidade_id_fkey" FOREIGN KEY ("unidade_id") REFERENCES "unidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas_requisito" ADD CONSTRAINT "respostas_requisito_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas_requisito" ADD CONSTRAINT "respostas_requisito_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_avaliacao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "respostas_requisito" ADD CONSTRAINT "respostas_requisito_requisito_id_fkey" FOREIGN KEY ("requisito_id") REFERENCES "requisitos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planos_acao" ADD CONSTRAINT "planos_acao_ciclo_id_fkey" FOREIGN KEY ("ciclo_id") REFERENCES "ciclos_avaliacao"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos_acao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_resposta_requisito_id_fkey" FOREIGN KEY ("resposta_requisito_id") REFERENCES "respostas_requisito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acoes" ADD CONSTRAINT "acoes_unidade_responsavel_id_fkey" FOREIGN KEY ("unidade_responsavel_id") REFERENCES "unidades"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_unidade_destino_id_fkey" FOREIGN KEY ("unidade_destino_id") REFERENCES "unidades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandas" ADD CONSTRAINT "demandas_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "acoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramitacoes_demanda" ADD CONSTRAINT "tramitacoes_demanda_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tramitacoes_demanda" ADD CONSTRAINT "tramitacoes_demanda_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_demanda_id_fkey" FOREIGN KEY ("demanda_id") REFERENCES "demandas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_tramite_id_fkey" FOREIGN KEY ("tramite_id") REFERENCES "tramitacoes_demanda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_resposta_requisito_id_fkey" FOREIGN KEY ("resposta_requisito_id") REFERENCES "respostas_requisito"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_acao_id_fkey" FOREIGN KEY ("acao_id") REFERENCES "acoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_auditoria" ADD CONSTRAINT "log_auditoria_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
