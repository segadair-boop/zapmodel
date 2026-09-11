# ZapModel — Central Omnichannel

Sistema de atendimento inspirado funcionalmente no código-fonte de referência HelloZap fornecido para o projeto.

## Fluxo de desenvolvimento

- **GitHub é a fonte oficial do código.**
- Todas as alterações do projeto devem ser realizadas diretamente neste repositório.
- **Lovable deve ser usado somente para visualização/preview do projeto**, sem geração ou edição de código.
- Branch principal: `main`.

## Preview

https://zapmodel.lovable.app

## Módulos implementados na interface

- Login e sessão de demonstração
- Dashboard operacional
- Atendimentos/Tickets
- Conversa por atendimento
- Alteração de status do ticket
- Contatos
- Conexões WhatsApp e fluxo visual de QR Code
- Filas e setores
- Respostas rápidas
- Kanban
- Agendamentos
- Tarefas
- Campanhas
- Chat interno
- Biblioteca de arquivos
- Integrações e API
- Usuários e perfis
- Financeiro/assinatura
- Configurações gerais
- Layout responsivo para desktop e dispositivos móveis
- Persistência local dos dados de demonstração usando `localStorage`

## Referência técnica analisada

O pacote de referência possui frontend React e backend Node.js/TypeScript com Express, Sequelize, Socket.IO, Bull/Redis, autenticação JWT, WhatsApp via Baileys, campanhas, filas, contatos, tickets, agendamentos, integrações e múltiplas empresas.

A versão atual deste repositório recria a experiência funcional para preview mantendo a stack moderna do projeto (React + TanStack Start + Vite). A conexão real com WhatsApp, banco persistente, filas Redis, autenticação de produção e disparos reais devem ser configurados na camada de backend antes de uso produtivo.

## Desenvolvimento local

```sh
npm install
npm run dev
```

Para produção:

```sh
npm run build
```
