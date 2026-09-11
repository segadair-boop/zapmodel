# ZapModel — Worker Persistente

Worker 24h do ZapModel para funções que exigem processo contínuo, especialmente WhatsApp via Baileys e Socket.IO. O frontend e os CRUDs principais usam diretamente o Lovable Cloud/Supabase; este serviço fica separado no Railway.

## Arquitetura

- Node.js 22 + TypeScript + Express
- Baileys para sessão do WhatsApp
- Socket.IO para eventos em tempo real
- Lovable Cloud/Supabase para autenticação e persistência
- RLS do Supabase aplicado também às requisições do worker
- Conta técnica autenticada para eventos recebidos em background
- Uploads e sessão Baileys em `/app/data`

O worker não usa `DATABASE_URL`, Prisma no runtime, JWT próprio nem service role no frontend.

## Variáveis de produção

```env
NODE_ENV=production
PORT=8080
FRONTEND_URL=https://zapmodel.lovable.app
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_PUBLISHABLE_KEY=CHAVE_PUBLICAVEL
WORKER_EMAIL=CONTA_TECNICA
WORKER_PASSWORD=SENHA_TECNICA
WA_AUTH_DIR=/app/data/wa-auth
UPLOAD_DIR=/app/data/uploads
LOG_LEVEL=info
```

Os valores reais da conta técnica ficam exclusivamente nas variáveis privadas do Railway e nunca devem ser commitados.

## Endpoints mantidos no worker

- `GET /api/health`
- `GET/POST /api/whatsapp`
- `POST /api/whatsapp/:id/connect`
- `POST /api/whatsapp/:id/disconnect`
- `DELETE /api/whatsapp/:id`
- `GET/POST /api/tickets/:id/messages`
- `POST /api/campaigns/:id/start`
- `POST /api/files`
- `POST /api/v1/messages/send`

As rotas autenticadas recebem o access token do Supabase em `Authorization: Bearer ...`. O worker valida a conta e executa as consultas respeitando RLS.

## Healthcheck

```bash
curl https://SEU-WORKER/api/health
```

Com a conta técnica autenticada e o Lovable Cloud acessível, a resposta deve indicar:

```json
{"ok":true,"service":"zapmodel-worker","database":"lovable-cloud"}
```

## Railway

Use o diretório `/backend` como Root Directory e `Dockerfile` como builder. O serviço deve permanecer ativo continuamente. Para uso real do WhatsApp, monte armazenamento persistente em `/app/data`; isso preserva credenciais Baileys e uploads entre redeploys.

## Frontend

O frontend continua publicado em `https://zapmodel.lovable.app`. A variável `VITE_API_URL` deve apontar somente para este worker Railway. Os módulos comuns acessam o Lovable Cloud diretamente e não dependem do worker.
