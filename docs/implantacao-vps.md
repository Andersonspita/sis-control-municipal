# Implantação na VPS

Uma imagem Docker roda a aplicação e as tarefas de operação. O `docker-compose.prod.yml` sobe quatro serviços:

- **postgres** (PostgreSQL 17 com pgvector) — dados, isolamento por cliente (RLS) e vetores da IA;
- **silo** (S3 compatível) — documentos e evidências enviados;
- **app** — Next.js em produção, com Chromium para os relatórios em PDF;
- **caddy** — proxy reverso com HTTPS automático (Let's Encrypt), opcional: só sobe com `--profile caddy`.

Banco e armazenamento ficam acessíveis só na rede interna do Docker. O app é publicado por padrão só em `127.0.0.1:3010` (variáveis `APP_IP` e `APP_PORTA`); quem atende as portas 80 e 443 é o Caddy (VPS limpa) ou o proxy que a VPS já tiver (seção 5).

## 1. Requisitos

- VPS com Ubuntu 24.04 (ou Debian 12), **mínimo 2 vCPU e 4 GB de RAM** (o build do Next e o Chromium consomem memória; com 2 GB, crie swap de 2 GB).
- Domínio com registro **DNS tipo A** apontando para o IP da VPS (necessário antes de emitir o certificado, pelo Caddy ou pelo painel).
- Conta SMTP para envio de e-mails (Amazon SES, Brevo, Mailgun, Google Workspace etc.).
- Chave de API do provedor de IA (cadastrada depois pela tela `/admin/ia`).

## 2. Preparar o servidor

```bash
sudo timedatectl set-timezone America/Bahia
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # saia e entre de novo na sessão SSH

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443
sudo ufw enable
```

## 3. Baixar o projeto e configurar as variáveis

```bash
sudo mkdir -p /opt/controladoria && sudo chown $USER /opt/controladoria
git clone https://github.com/Andersonspita/sis-control-municipal.git /opt/controladoria
cd /opt/controladoria
cp deploy/env.producao.example .env
chmod 600 .env
nano .env
```

Preencha todas as variáveis do `.env`. Para gerar os segredos:

```bash
openssl rand -hex 32                     # PG_SENHA_DONO, APP_DB_PASSWORD, S3_SECRET_KEY (só letras e números)
docker run --rm node:24-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"   # SESSION_SECRET
docker run --rm node:24-alpine node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"      # CHAVE_CRIPTOGRAFIA
```

> Guarde uma cópia do `.env` em local seguro (cofre de senhas). Sem a `CHAVE_CRIPTOGRAFIA` original, a chave da IA gravada no banco fica ilegível e precisa ser recadastrada.

## 4. Primeira instalação

```bash
cd /opt/controladoria
alias dc="docker compose -f docker-compose.prod.yml"

dc build app                                  # leva alguns minutos
dc up -d postgres silo

dc run --rm app npm run db:setup              # cria o papel da aplicação (sem BYPASSRLS)
dc run --rm app npm run db:deploy             # aplica as migrações
dc run --rm app npm run catalogos:importar    # OT 05/2024 e Res. TCM-BA 1120/2005

dc run --rm app npm run usuario:criar -- \
  --email voce@horizonaj.com.br --senha 'SenhaForte123' --nome "Seu Nome" --admin

dc --profile caddy up -d                      # VPS limpa: sobe também o Caddy (HTTPS)
# dc up -d                                    # VPS que já tem proxy nas portas 80/443: veja a seção 5
dc ps                                         # app deve ficar "healthy"
```

Com o Caddy, preencha `DOMINIO` e `EMAIL_ACME` no `.env` antes de subir. Abra `https://SEU_DOMINIO`, entre com o administrador e:

1. em **Administração → Clientes**, cadastre as entidades (Prefeitura, Câmara, autarquias);
2. em **Administração → Usuários**, crie os usuários e vincule-os aos clientes (o administrador também precisa de vínculo para operar dentro de um cliente: `usuario:criar` aceita `--perfil CONTROLADOR --clientes todos`, desde que os clientes já existam);
3. em **Administração → IA**, cadastre a chave do provedor de IA e o limite de gasto.

Não rode `npm run db:seed` em produção: ele cria dados de demonstração.

## 5. VPS que já tem proxy (OpenResty/Nginx/painel)

Se as portas 80 e 443 já estão ocupadas por outro proxy (ex.: OpenResty de um painel servindo outros sistemas), o Caddy não sobe. Nesse caso o proxy existente encaminha o domínio para o app no loopback:

1. Suba sem o Caddy — `dc up -d` já não o inclui (deixe `DOMINIO` e `EMAIL_ACME` vazios no `.env`). Se a porta 3010 estiver ocupada, troque `APP_PORTA` no `.env`.
2. Teste o app pelo próprio servidor:

   ```bash
   curl -I http://127.0.0.1:3010/login         # deve responder HTTP/1.1 200
   ```

3. No painel, crie o site do domínio como **proxy reverso** para `http://127.0.0.1:3010`. Se o painel aceitar configuração personalizada, use o bloco de [`deploy/openresty-controladoria.conf`](../deploy/openresty-controladoria.conf); o essencial é repassar `Host` e `X-Forwarded-Host` com o domínio público (sem isso, os formulários falham com "Invalid Server Actions request") e `X-Forwarded-Proto`.
4. Emita o certificado **Let's Encrypt** pelo painel e ative o redirecionamento HTTP → HTTPS. O sistema exige HTTPS: em produção o cookie de sessão é `secure` e não funciona em `http://`.
5. Ajuste o tamanho máximo de upload do site para **110 MB** (`client_max_body_size 110m`) e o tempo limite de leitura para **300 s** (relatórios em PDF e IA).
6. Confirme que `APP_URL` no `.env` é o endereço `https://` do domínio (usado nos links dos e-mails).

Se o OpenResty roda em container **sem** rede host, `127.0.0.1` aponta para o próprio container: use o IP do gateway do Docker (ex.: `172.17.0.1`) no `proxy_pass` e defina `APP_IP=172.17.0.1` no `.env` (detalhes no comentário do arquivo de exemplo).

Sem domínio nem certificado (acesso provisório pelo IP), dá para publicar o app direto com `APP_IP=0.0.0.0` e `COOKIE_SEGURO=false`, liberando a porta no firewall. Use só como paliativo: o tráfego, inclusive a senha, passa sem criptografia.

## 6. Tarefas agendadas (cron do servidor)

Edite com `crontab -e` e inclua:

```cron
# Lembretes de prazo das demandas, todo dia às 7h
0 7 * * * cd /opt/controladoria && docker compose -f docker-compose.prod.yml run --rm app npm run lembretes:prazo >> /var/log/controladoria/lembretes.log 2>&1

# Backup diário do banco às 2h, mantendo 14 dias
0 2 * * * cd /opt/controladoria && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres -Fc controladoria > /var/backups/controladoria/banco-$(date +\%F).dump && find /var/backups/controladoria -name 'banco-*.dump' -mtime +14 -delete

# Backup semanal dos documentos (domingo às 3h), mantendo 4 cópias
0 3 * * 0 docker run --rm -v controladoria-prod_arquivos:/dados:ro -v /var/backups/controladoria:/destino alpine tar czf /destino/arquivos-$(date +\%F).tar.gz -C /dados . && find /var/backups/controladoria -name 'arquivos-*.tar.gz' -mtime +28 -delete
```

Crie as pastas antes: `sudo mkdir -p /var/log/controladoria /var/backups/controladoria && sudo chown $USER /var/log/controladoria /var/backups/controladoria`.

Os backups locais protegem contra erros de operação, não contra perda da VPS: copie `/var/backups/controladoria` para outro lugar (ex.: `rclone` para um bucket externo, ou o backup automático do provedor da VPS).

### Restaurar o banco

```bash
dc stop app
dc exec -T postgres pg_restore -U postgres -d controladoria --clean --if-exists < /var/backups/controladoria/banco-AAAA-MM-DD.dump
dc start app
```

## 7. Atualizar a aplicação

```bash
cd /opt/controladoria
git pull
dc build app
dc run --rm app npm run db:deploy
dc up -d app
docker image prune -f
```

## 8. Diagnóstico

| Situação | Comando |
| --- | --- |
| Logs da aplicação | `dc logs -f app` |
| Logs do HTTPS/certificado (Caddy) | `dc logs -f caddy` |
| App responde no servidor | `curl -I http://127.0.0.1:3010/login` |
| Estado dos serviços | `dc ps` |
| Console do banco | `dc exec postgres psql -U postgres controladoria` |
| Testar envio de e-mail | demande algo para um satélite e veja `dc logs app` |

- **Certificado não emitido:** confira se o DNS já aponta para a VPS e se as portas 80/443 estão abertas.
- **PDF falha ao gerar:** veja `dc logs app`; o `shm_size` do serviço `app` precisa estar presente.
- **Envio de anexos grandes falha:** o limite é 105 MB por envio (aplicação) e 110 MB no proxy (Caddy ou `client_max_body_size` do painel).
- **Login não mantém a sessão:** o site precisa estar em HTTPS (cookie `secure`); só no acesso provisório por HTTP use `COOKIE_SEGURO=false`.
- **"Invalid Server Actions request" nos logs:** o proxy não está repassando `Host`/`X-Forwarded-Host` com o domínio público.
