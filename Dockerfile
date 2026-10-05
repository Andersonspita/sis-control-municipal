# Imagem única de produção: serve a aplicação (next start) e roda as tarefas de operação
# (migrações, catálogos, criação de usuário, lembretes) com `docker compose run --rm app npm run <script>`.
FROM node:24-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
# O Prisma CLI (migrate deploy) precisa do OpenSSL.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
# Valores fictícios só para o build: a conexão é criada ao carregar os módulos, mas nenhuma consulta roda aqui.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    APP_DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    SESSION_SECRET="somente-para-o-build" \
    sh -c "npx prisma generate && npm run build"

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    PDF_CHROMIUM_PATH=/usr/bin/chromium
# Chromium e fontes para os relatórios em PDF; tini repassa sinais e recolhe processos filhos do navegador.
RUN apt-get update \
 && apt-get install -y --no-install-recommends chromium fonts-liberation fonts-dejavu-core ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]
