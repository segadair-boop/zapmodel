# Auditoria final somente leitura — HEAD dd5e535

Nenhum arquivo, banco, env ou infraestrutura foi alterado. Nenhum commit foi feito.

## Compilação

- `bunx tsgo --noEmit` (frontend): OK, sem erros.
- `npm run build` (raiz): OK, build concluído.
- `backend npx tsc -p tsconfig.json --noEmit`: OK, sem erros (dependências já instaladas).

**Não há bug bloqueador de compilação.** Os itens abaixo são defeitos funcionais reais ainda presentes.

## Bloqueadores funcionais

### 1. Todo cadastro novo cai sempre na primeira empresa
- Onde: função `ensure_profile` no banco (`select id into v_company from public."Company" order by "createdAt" asc limit 1`).
- Causa: nunca cria empresa nova para um usuário novo; sempre reutiliza a mais antiga.
- Efeito: multiempresa é impossível; qualquer pessoa aprovada passa a ver dados da empresa existente.
- Correção sugerida: criar empresa própria quando o e-mail não pertencer a um convite/domínio conhecido, ou adotar fluxo explícito de convite por empresa.

### 2. Worker de background enxerga apenas a empresa da conta técnica
- Onde: `backend/src/supabase.ts` (`background`, `backgroundProfile`) usado em `store.persistIncomingMessage`, `app.resumeCampaigns`, `app.processSchedules`, `bootstrap`.
- Causa: a conta técnica é um usuário comum sujeito a RLS por `companyId`.
- Efeito: mensagens recebidas, mídias, agendamentos, campanhas e reconexão de sessões de qualquer outra empresa são silenciosamente descartados (só aparece `console.error`).
- Correção sugerida: uma conta técnica por empresa, ou uma RPC `SECURITY DEFINER` dedicada ao worker com escopo por `sessionId`.

### 3. Sessões WhatsApp e arquivos se perdem a cada restart
- Onde: `backend/src/whatsapp.ts` (`WA_AUTH_DIR`, padrão `data/wa-auth`) e `backend/src/app.ts` (`UPLOAD_DIR`, padrão `data/uploads`).
- Causa: escrita em disco efêmero do contêiner, sem volume persistente.
- Efeito: após cada deploy/restart no Railway todas as conexões exigem novo QR, e todo download de `FileAsset` (inclusive mídias já registradas no banco) retorna 404.
- Correção sugerida: montar volume persistente para ambos os diretórios, ou migrar arquivos para Storage e credenciais Baileys para tabela própria.

## Defeitos de média prioridade

### 4. Mensagem digitada é perdida quando o envio falha
- Onde: `src/routes/index.tsx`, `Tickets.send` — `setText("")` ocorre antes de `worker(...)` resolver.
- Correção: limpar o campo só após sucesso, ou restaurar o texto no `catch`.

### 5. Campanha "Retomar" é inalcançável e campanha travada só destrava no restart
- Onde: `src/routes/index.tsx` `Campaigns.canStart` inclui `PAUSED`, mas não existe endpoint de pausa em `backend/src/app.ts`; `resumeCampaigns()` só roda em `bootstrap()`.
- Efeito: se o worker cair no meio do disparo, a campanha fica `RUNNING` até o próximo restart do processo.
- Correção: endpoint de pausa/cancelamento e varredura periódica de campanhas `RUNNING` órfãs.

### 6. Status de conexão falso quando o worker está fora do ar
- Onde: `src/routes/index.tsx` `Connections` — no fallback para `selectAll("WhatsAppSession")` não existe o campo `connected`, então `realStatus` mantém `CONNECTED` gravado no banco.
- Correção: marcar explicitamente o modo "sem worker" e exibir status como não confirmado.

### 7. Eventos Socket.IO emitidos e nunca consumidos
- Onde: `backend/src/app.ts` emite `message:created`, `ticket:updated`, `session:updated`, `campaign:finished`, `schedule:sent`; o frontend não abre socket algum (só polling de 2,5–7 s).
- Efeito: latência e carga desnecessárias; recurso pago e não usado.

### 8. Envio pela API pública não cria atendimento
- Onde: `backend/src/app.ts` `/api/v1/messages/send` chama `sendText` sem criar `Ticket`/`Message`.
- Efeito: o registro só aparece se o eco `fromMe` do Baileys chegar; se a sessão não ecoar, o disparo fica invisível no histórico.

### 9. Agendamento sem conexão nunca vence
- Onde: `backend/src/app.ts` `processSchedules` — quando não há sessão conectada, grava `lastError` e faz `continue` sem incrementar `attempts`.
- Efeito: item fica em loop indefinido exibindo "Aguardando conexão do WhatsApp." sem nunca falhar formalmente. Correção: limite de tempo/tentativas para esse caso.

## Verificado e correto

- Colunas, enums e `companyId` usados no frontend batem com o schema; `insertRow`/`updateRow` aplicam `updatedAt`.
- `fail()` em `src/lib/db.ts` já traduz erros de RLS, chave duplicada e FK para texto amigável.
- Gating de papéis já existe: `ADMIN_ONLY_NAV`, `isAdmin`, telas `Info` de acesso restrito e botões condicionais.
- `set_user_role`/`set_user_active` impedem criar segundo OWNER e desativar o proprietário.
- Índices únicos protegem ticket ativo único por contato/sessão e idempotência por `externalId`.
- Resolução LID→PN, gravação de `whatsappJid` e exibição "Número não resolvido" estão consistentes.
