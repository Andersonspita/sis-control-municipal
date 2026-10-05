-- Telefone/celular do usuário, editável pelo próprio usuário em Configurações › Minha conta.
-- Guardado só com dígitos (DDD + número).

ALTER TABLE "usuarios"
  ADD COLUMN "telefone" VARCHAR(11),
  ADD CONSTRAINT "usuarios_telefone_digitos" CHECK ("telefone" IS NULL OR "telefone" ~ '^[0-9]{10,11}$');
