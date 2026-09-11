# ZapModel — Central Omnichannel

Sistema de atendimento e automação baseado funcionalmente no código-fonte HelloZap fornecido pelo proprietário do projeto.

## Regra do projeto

- **GitHub é a fonte oficial do código.**
- Alterações devem ser realizadas diretamente neste repositório.
- **Lovable é usado somente para visualização/preview**, sem geração de código.
- Branch principal: `main`.
- Preview: https://zapmodel.lovable.app

## Arquitetura

O projeto possui duas camadas:

1. **Frontend** — React + TanStack Start + Vite, visualizado pelo Lovable.
2. **Backend persistente** — Node.js/TypeScript + Express + PostgreSQL/Prisma + Socket.IO + Baileys, preparado para Docker/VPS.

## Backend funcional

Inclui:

- autenticação JWT e perfis OWNER/ADMIN/AGENT;
- empresas/isolamento por `companyId`;
- contatos;
- tickets/atendimentos;
- mensagens;
- envio de texto e mídia;
- recebimento de mensagens em tempo real;
- conexão WhatsApp por QR Code com persistência da sessão;
- reconexão automática;
- filas/setores;
- respostas rápidas;
- tags/Kanban;
- agendamentos com envio automático;
- campanhas com processamento e status de cada destinatário;
- tarefas;
- usuários;
- configurações;
- uploads e biblioteca de arquivos;
- API externa com token;
- auditoria;
- Socket.IO;
- Docker Compose com PostgreSQL e Redis;
- CI para validar frontend e backend.

## Execução do frontend

```bash
bun install
bun run dev
```

## Execução completa em servidor

```bash
cp backend/.env.example .env
# defina secrets e credenciais fortes
docker compose up -d --build
```

Leia `backend/README.md` antes de publicar.

## Variável do frontend

Para usar dados reais em vez do modo de preview, configure:

```env
VITE_API_URL=https://api.seudominio.com
```

## Observação sobre WhatsApp

A sessão WhatsApp precisa de um processo persistente 24h. Portanto, o frontend pode ficar no Lovable/Vercel, mas o backend de WhatsApp deve ficar em VPS ou serviço de containers persistentes. O código usa Baileys (WhatsApp Web não oficial); para um produto comercial que exija integração oficialmente suportada pela Meta, adapte o conector para a WhatsApp Business Cloud API.
