# ZapModel Backend

Backend persistente do ZapModel. Ele deve rodar 24h em VPS/servidor/container; não use uma função serverless para a sessão do WhatsApp.

## Serviços

- Node.js 22 + TypeScript
- Turso (libSQL/SQLite) + Prisma
- `@prisma/adapter-libsql` para conexão remota com o Turso
- Socket.IO para atualização em tempo real
- Baileys para WhatsApp Web
- Uploads persistentes
- Campanhas e agendamentos processados continuamente
- JWT e perfis OWNER/ADMIN/AGENT
- API externa por token
- Auditoria

## Criar o banco no Turso

Crie um banco Turso e obtenha a URL e o token de autenticação. As variáveis usadas pelo backend são:

```env
TURSO_DATABASE_URL=libsql://SEU-BANCO-SUA-ORG.turso.io
TURSO_AUTH_TOKEN=SEU_TOKEN
```

O backend executa `prisma/turso-init.sql` no primeiro start usando `src/init-turso.ts`. Os comandos usam `CREATE TABLE/INDEX IF NOT EXISTS`, portanto podem ser executados novamente sem apagar os dados existentes.

## Subir com Docker

Na raiz do repositório:

```bash
cp backend/.env.example .env
# configure TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET,
# OWNER_EMAIL e OWNER_PASSWORD no .env
docker compose up -d --build
```

O container executa nesta ordem:

1. inicialização/validação do schema no Turso;
2. seed do proprietário e filas iniciais;
3. inicialização da API e do serviço WhatsApp.

Backend: `http://SEU_SERVIDOR:8080`

Teste:

```bash
curl http://localhost:8080/api/health
```

Quando a conexão com o Turso estiver correta, a resposta exibirá `database: "turso"`.

## Primeiro acesso

O usuário proprietário é criado a partir de `OWNER_NAME`, `OWNER_EMAIL` e `OWNER_PASSWORD`.

## WhatsApp

1. Entre no sistema como OWNER/ADMIN.
2. Crie uma conexão em Conexões.
3. O backend abre uma sessão Baileys e retorna o QR Code.
4. Escaneie em WhatsApp > Aparelhos conectados.
5. As credenciais ficam persistidas no volume `backend_data` em `/app/data/wa-auth`.

## Frontend

Configure `VITE_API_URL` apontando para a URL pública HTTPS do backend, por exemplo:

```env
VITE_API_URL=https://api.seudominio.com
```

No proxy HTTPS, libere WebSocket para Socket.IO e encaminhe `/uploads` e `/api` ao backend.

## Desenvolvimento local do schema

O Prisma continua configurado como SQLite local no arquivo `schema.prisma`, conforme o fluxo recomendado para Turso. Para alterações futuras de modelos, valide localmente com:

```bash
npm run db:push
npx prisma generate
```

Depois atualize `prisma/turso-init.sql` ou gere/aplique uma migração compatível no banco remoto.

## Produção

Antes de uso real:

- troque todas as senhas e secrets de exemplo;
- mantenha `TURSO_AUTH_TOKEN` somente no backend;
- use HTTPS;
- restrinja firewall;
- mantenha backup/exportação do banco Turso e do volume `backend_data`;
- defina CORS (`FRONTEND_URL`) com o domínio exato do frontend;
- monitore logs e espaço em disco;
- respeite os termos e políticas do WhatsApp/Meta para mensagens e campanhas.
