# Auditoria técnica ZapModel — HEAD atual (somente leitura)

Compilação validada: aplicativo web sem erros de tipo; serviço do WhatsApp (`backend/`) compila limpo após `npm ci`. Nenhum arquivo alterado, nenhuma escrita no banco.

A lista abaixo traz apenas problemas que ainda existem hoje. Itens já corrigidos (LID/JID no envio e recepção, índice único de ticket ativo, idempotência por `externalId`, arrastar cards no Kanban, destinatários de campanha, agendamentos processados) não foram repetidos.

## Críticos

1. **Todo novo cadastro cai na primeira empresa existente** — função `ensure_profile` (banco). `select id into v_company ... order by "createdAt" limit 1`: qualquer pessoa que se cadastre entra na empresa do proprietário (inativa, mas já dentro do escopo). Correção: criar empresa própria por cadastro, ou exigir convite/token de empresa.

2. **A conta técnica do worker só enxerga uma empresa** — `backend/src/supabase.ts:background()` + uso em `store.ts` e `app.ts`. Como ela respeita RLS e pertence a uma única empresa, mensagens recebidas, campanhas e agendamentos de qualquer outra empresa falham silenciosamente (`persistIncomingMessage` retorna null; `processSchedules` nunca acha a conexão). Também quebra a checagem de idempotência por `externalId` entre empresas. Correção: worker com identidade por empresa (uma sessão técnica por empresa) ou função `security definer` dedicada no banco para essas gravações.

3. **Arquivos e sessões do WhatsApp em disco efêmero** — `backend/src/app.ts` (`uploadDir`) e `whatsapp.ts` (`WA_AUTH_DIR`). No Railway sem volume, cada deploy apaga uploads (download 404 com registro no banco intacto) e as credenciais Baileys (exige novo QR). Correção: volume persistente ou armazenamento de arquivos no Cloud Storage.

4. **`mediaUrl` aponta para rota inexistente** — `app.ts:186` grava `/api/files/raw/<arquivo>`, mas não há handler `/api/files/raw/:name`. Toda mídia enviada fica com link quebrado; o app ainda exibe só o texto "Arquivo". Correção: criar a rota autenticada ou reutilizar `/api/files/:id/download`.

5. **Estado da conexão fica preso após queda do worker** — `app.ts:bootstrap()` reconecta, mas nada marca como `DISCONNECTED` as sessões cuja reconexão falha; a tela lê `WhatsAppSession` direto do banco. Resultado: aparece "CONNECTED" e o envio retorna 409. Correção: no startup, zerar status das sessões sem socket e refletir `isSessionConnected` no que a tela mostra.

## Altos

6. **Cadastros "Filas & Setores" e "Respostas rápidas" compartilham estado** — `src/routes/index.tsx`, `SimpleCrud` + `useData`. `reload` tem lista de dependências vazia e o mesmo componente ocupa a mesma posição na árvore; ao trocar de item no menu, a tela mostra dados da tabela anterior e o "Novo" pode gravar na tabela errada. Correção: `key={table}` no elemento e incluir `loader`/`table` nas dependências.

7. **Mensagens somem quando o worker está fora do ar** — `Tickets.loadMessages`: com `VITE_API_URL` definido, só busca pelo worker; erro apenas vira `console.error`. Correção: fallback de leitura direto no banco e aviso visível.

8. **Mídia recebida chega vazia** — `whatsapp.ts:messages.upsert` não baixa anexos; grava `body` vazio, sem `mediaUrl`/`mediaType`. Correção: `downloadMediaMessage` + persistência do arquivo.

9. **Agendamento com falha repete indefinidamente** — `app.ts:processSchedules`. Sem contador de tentativas nem marcação de erro, um número inválido é reprocessado a cada 30s para sempre. Correção: campo de erro/tentativas e desistência após N falhas.

10. **Campanha pode ficar presa em RUNNING** — `app.ts:/api/campaigns/:id/start`: o laço vive na memória do processo; um restart deixa a campanha "em execução" sem ninguém enviando, e os pendentes nunca são retomados. Correção: retomada no startup a partir de `CampaignContact` pendentes.

11. **Corrida ao iniciar campanha** — a checagem de `status === 'RUNNING'` e o `update` não são atômicos; dois cliques quase simultâneos disparam dois laços e duplicam mensagens. Correção: update condicional (`.eq('status','DRAFT')`) e só seguir se afetou linha.

12. **Contatos não podem ser excluídos quando há campanha/agendamento vinculado** — `Contacts.del` só valida tickets; a falha de chave estrangeira aparece como erro técnico cru. Correção: validar `CampaignContact` também e traduzir a mensagem.

## Médios

13. **`Message_externalId_key` é global, não por conexão** — índice único sem escopo de empresa/sessão; um ID repetido entre contas descarta mensagem legítima. Correção: unicidade por `(ticketId, externalId)` ou por sessão.

14. **Contadores do painel mascaram erro** — `src/lib/db.ts:countRows` devolve 0 em qualquer falha; RLS bloqueada aparece como "zero". Correção: propagar o erro para o `Alert` já existente.

15. **Erros técnicos em `alert()`** — praticamente todos os fluxos de `index.tsx` exibem mensagem crua do Postgres/Supabase. Correção: camada de tradução de erros.

16. **Tokens de API sem revogação na tela** — `Integrations` cria e lista, mas não desativa/exclui; a coluna `active` nunca muda pela interface. Correção: ação de desativar.

17. **Botão de perfil visível para ADMIN sem efeito** — `UsersPage.toggleRole` retorna silenciosamente quando quem clica não é OWNER. Correção: esconder/desabilitar o botão.

18. **Socket.IO não é consumido pelo app** — o worker emite `message:created`, `ticket:updated`, `campaign:finished`, `schedule:sent`, mas o front usa apenas polling de 2,5–7s (dois timers simultâneos em Atendimentos). Correção: assinar os eventos ou remover a emissão para reduzir custo.

19. **`unread` só zera pelo worker** — `GET /api/tickets/:id/messages`. Sem worker, o contador nunca zera. Correção: zerar também na leitura direta.

20. **Health check derruba o serviço quando a conta técnica falha** — `/api/health` responde 503 se `WORKER_EMAIL`/`WORKER_PASSWORD` falharem, causando ciclo de restart no Railway sem log claro. Correção: separar liveness de readiness.

21. **API externa sem limite de uso nem trilha** — `/api/v1/messages/send` não registra `AuditLog`, não limita taxa e não grava a mensagem enviada em ticket. Correção: rate limit + persistência da mensagem.

22. **AGENT tem os mesmos poderes de escrita que ADMIN em contatos e arquivos** — políticas `is_app_member()` em `Contact`/`FileAsset` permitem exclusão. Confirmar se é intencional.

## Observações menores

- `formatPhone` assume DDI 55; números internacionais aparecem como `+<dígitos>`.
- Uploads salvos sem extensão (`multer dest`), o que dificulta recuperação manual.
- Origens de CORS do preview estão fixas no código (`app.ts:34-37`); ao mudar o ID do preview, quebra.
- `backend/prisma/schema.prisma` permanece apenas como referência e pode confundir quem for manter o projeto.

## Próximo passo sugerido

Nada foi alterado. Se aprovar, posso corrigir por blocos, começando pelos itens 1–5 (multiempresa, worker, persistência e estado de conexão), depois 6–12.
