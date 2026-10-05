-- Município de acesso: agrupa as entidades (Prefeitura, Câmara, autarquias…) do mesmo município
-- e define o link de entrada /m/<slug>. Tabela global (sem RLS), como clientes.

CREATE TABLE "municipios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "nome" TEXT NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "codigo_ibge" VARCHAR(7),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "municipios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "municipios_slug_check" CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 80),
    CONSTRAINT "municipios_codigo_ibge_check" CHECK (codigo_ibge ~ '^\d{7}$')
);

CREATE UNIQUE INDEX "municipios_slug_key" ON "municipios"("slug");
CREATE UNIQUE INDEX "municipios_codigo_ibge_key" ON "municipios"("codigo_ibge");

-- Slug a partir do nome e da UF: sem acento, minúsculo, hífens. Ex.: ('Catolândia', 'BA') → catolandia-ba.
-- A mesma regra existe em src/lib/municipios.ts (gerarSlugMunicipio).
CREATE FUNCTION app_slug_municipio(nome text, uf text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(
           nullif(trim(BOTH '-' FROM regexp_replace(
             lower(translate(nome,
               'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
               'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')),
             '[^a-z0-9]+', '-', 'g')), ''),
           'municipio')
         || '-' || lower(trim(uf))
$$;

-- Popula a partir dos clientes atuais. Grafias que geram o mesmo slug caem no mesmo município;
-- o código IBGE mais frequente do grupo é mantido (e só em um município, se houver conflito).
WITH grupos AS (
  SELECT app_slug_municipio(municipio, uf) AS slug,
         (array_agg(municipio ORDER BY (codigo_ibge IS NULL), criado_em))[1] AS nome,
         upper(min(uf)) AS uf,
         mode() WITHIN GROUP (ORDER BY codigo_ibge) AS codigo_ibge
  FROM clientes
  GROUP BY 1
)
INSERT INTO municipios (slug, nome, uf, codigo_ibge)
SELECT slug, nome, uf,
       CASE WHEN codigo_ibge IS NOT NULL
             AND row_number() OVER (PARTITION BY codigo_ibge ORDER BY slug) = 1 THEN codigo_ibge END
FROM grupos;

ALTER TABLE "clientes" ADD COLUMN "municipio_id" UUID;

UPDATE clientes c SET municipio_id = m.id
FROM municipios m
WHERE m.slug = app_slug_municipio(c.municipio, c.uf);

ALTER TABLE "clientes" ALTER COLUMN "municipio_id" SET NOT NULL;
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_municipio_id_fkey"
  FOREIGN KEY ("municipio_id") REFERENCES "municipios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "clientes_municipio_id_idx" ON "clientes"("municipio_id");

-- municipio_id é a fonte da verdade; municipio/uf/codigo_ibge do cliente são cópias mantidas aqui
-- (relatórios e integrações continuam lendo do cliente). Inserções sem municipio_id (seed, scripts)
-- são agrupadas pelo código IBGE ou pelo slug, criando o município se ainda não existir.
CREATE FUNCTION app_clientes_municipio() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  m municipios%ROWTYPE;
  s text;
BEGIN
  IF NEW.municipio_id IS NULL THEN
    IF NEW.codigo_ibge IS NOT NULL THEN
      SELECT * INTO m FROM municipios WHERE codigo_ibge = NEW.codigo_ibge;
    END IF;
    IF m.id IS NULL THEN
      s := app_slug_municipio(NEW.municipio, NEW.uf);
      SELECT * INTO m FROM municipios WHERE slug = s;
      IF m.id IS NULL THEN
        INSERT INTO municipios (slug, nome, uf, codigo_ibge)
        VALUES (s, NEW.municipio, upper(NEW.uf), NEW.codigo_ibge)
        RETURNING * INTO m;
      END IF;
    END IF;
    NEW.municipio_id := m.id;
  ELSE
    SELECT * INTO m FROM municipios WHERE id = NEW.municipio_id;
  END IF;

  NEW.municipio := m.nome;
  NEW.uf := m.uf;
  IF m.codigo_ibge IS NOT NULL THEN
    NEW.codigo_ibge := m.codigo_ibge;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER clientes_municipio
  BEFORE INSERT OR UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION app_clientes_municipio();

CREATE FUNCTION app_municipios_propagar() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE clientes SET municipio = NEW.nome, uf = NEW.uf, codigo_ibge = coalesce(NEW.codigo_ibge, codigo_ibge)
  WHERE municipio_id = NEW.id;
  RETURN NULL;
END $$;

CREATE TRIGGER municipios_propagar
  AFTER UPDATE OF nome, uf, codigo_ibge ON municipios
  FOR EACH ROW EXECUTE FUNCTION app_municipios_propagar();

-- Sessão aberta pelo link do município: fica restrita às entidades dele (exceto administradores).
ALTER TABLE "sessoes" ADD COLUMN "municipio_acesso_id" UUID;
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_municipio_acesso_id_fkey"
  FOREIGN KEY ("municipio_acesso_id") REFERENCES "municipios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'controladoria_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON municipios TO controladoria_app;
  END IF;
END $$;
