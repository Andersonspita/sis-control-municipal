-- IA de vários provedores: OpenAI, Anthropic, Google (Gemini) e qualquer API compatível com a da OpenAI
-- (Groq, DeepSeek, Mistral, OpenRouter, Azure OpenAI, Ollama/LM Studio etc.).
-- O padrão OPENAI preserva a configuração existente. Embeddings podem usar outro provedor e outra chave
-- (provedor_embeddings nulo = mesmo provedor e chave do texto). As políticas de RLS da tabela continuam valendo.

ALTER TABLE "configuracoes_ia"
  ADD COLUMN "provedor" VARCHAR(30) NOT NULL DEFAULT 'OPENAI',
  ADD COLUMN "url_base" VARCHAR(300),
  ADD COLUMN "provedor_embeddings" VARCHAR(30),
  ADD COLUMN "url_base_embeddings" VARCHAR(300),
  ADD COLUMN "chave_embeddings_cifrada" TEXT,
  ADD COLUMN "chave_embeddings_final" VARCHAR(4);

ALTER TABLE "configuracoes_ia"
  ADD CONSTRAINT "configuracoes_ia_provedor_valido"
    CHECK ("provedor" IN ('OPENAI', 'ANTHROPIC', 'GOOGLE', 'OPENAI_COMPATIVEL')),
  ADD CONSTRAINT "configuracoes_ia_provedor_embeddings_valido"
    CHECK ("provedor_embeddings" IS NULL OR "provedor_embeddings" IN ('OPENAI', 'GOOGLE', 'OPENAI_COMPATIVEL')),
  ADD CONSTRAINT "configuracoes_ia_url_compativel"
    CHECK ("provedor" <> 'OPENAI_COMPATIVEL' OR "url_base" IS NOT NULL),
  ADD CONSTRAINT "configuracoes_ia_url_embeddings_compativel"
    CHECK ("provedor_embeddings" IS DISTINCT FROM 'OPENAI_COMPATIVEL' OR "url_base_embeddings" IS NOT NULL);
