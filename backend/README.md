# ZapModel Backend

Backend persistente do ZapModel. Ele deve rodar 24h em VPS/servidor/container; não use uma função serverless para a sessão do WhatsApp.

## Serviços

- Node.js 22 + TypeScript
- PostgreSQL + Prisma
- Socket.IO para atualização em tempo real
- Baileys para WhatsApp Web
- Uploads persistentes
- Campanhas e agendamentos processados continuamente
- JWT e perfis OWNER/ADMIN/AGENT
- API externa por token
- Auditoria

## Subir com Docker

Na raiz do repositório:

```bash
cp backend/.env.example .env
# altere POSTGRES_PASSWORD, JWT_SECRET, OWNER_EMAIL e OWNER_PASSWORD no .env
docker compose up -d --build
```

Backend: `http://SEU_SERVIDOR:8080`

Teste:

```bash
curl http://localhost:8080/api/health
```

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

## Produção

Antes de uso real:

- troque todas as senhas e secrets de exemplo;
- use HTTPS;
- restrinja firewall;
- faça backup dos volumes PostgreSQL e `backend_data`;
- defina CORS (`FRONTEND_URL`) com o domínio exato do frontend;
- monitore logs e espaço em disco;
- respeite os termos e políticas do WhatsApp/Meta para mensagens e campanhas.
