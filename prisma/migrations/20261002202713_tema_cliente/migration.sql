-- AlterTable
ALTER TABLE "clientes" ADD COLUMN     "tema" VARCHAR(20) NOT NULL DEFAULT 'mata';

-- Mantém a lista em sincronia com src/lib/temas.ts.
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tema_check"
  CHECK ("tema" IN ('institucional', 'petroleo', 'grafite', 'ameixa', 'mata', 'bordo'));
