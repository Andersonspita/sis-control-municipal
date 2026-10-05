-- Classificação dos requisitos: tipo, peso, macrofunções da OT 05/2024, periodicidade e palavras-chave.

-- CreateEnum
CREATE TYPE "TipoRequisito" AS ENUM ('ESTRUTURAL', 'PROCEDIMENTAL', 'DOCUMENTAL');

-- CreateEnum
CREATE TYPE "Macrofuncao" AS ENUM ('AUDITORIA_INTERNA', 'CONTROLADORIA', 'CORREGEDORIA', 'OUVIDORIA');

-- AlterTable
ALTER TABLE "requisitos"
  ADD COLUMN "tipo" "TipoRequisito",
  ADD COLUMN "peso" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "macrofuncoes" "Macrofuncao"[] NOT NULL DEFAULT ARRAY[]::"Macrofuncao"[],
  ADD COLUMN "periodicidade" TEXT,
  ADD COLUMN "palavras_chave" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Peso zero ou negativo distorceria o índice (o requisito sairia do denominador sem ser "não se aplica").
ALTER TABLE "requisitos" ADD CONSTRAINT "requisitos_peso_faixa" CHECK ("peso" BETWEEN 1 AND 10);
