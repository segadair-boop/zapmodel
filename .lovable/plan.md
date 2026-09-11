# Auditoria de integração ZapModel (somente análise)

Nenhum arquivo, banco, env ou infraestrutura foi alterado neste turno.

## Validação executada

- Frontend: `bunx tsgo --noEmit` — sem erros.
- Backend: `tsc --noEmit` acusa apenas módulos ausentes (`multer`, `socket.io`, `@whiskeysockets/baileys`, `qrcode`, `pino`) porque `backend/node_modules` não está instalado neste ambiente. Não é erro de código.
- Teste de navegador no preview: não executado — a tela inicial exige login e não há credenciais de teste disponíveis. Posso rodar se você autorizar entrar com uma conta.

## Bloqueadores (alta prioridade)

1. **Todo o processamento em segundo plano é limitado a uma única empresa.**
   `backend/src/app.ts` (`runCampaign`, `resumeCampaigns`, `processSchedules`, sink `onMessage`) e `backend/src/store.ts` usam o cliente da conta técnica (`background()`), que é um usuário comum sujeito a RLS por `current_company_id()`. Campanhas, agendamentos, contatos, tickets, mensagens e mídia recebida de qualquer outra empresa simplesmente não aparecem nas consultas nem podem ser gravados; as falhas caem em `console.error` e a UI continua mostrando "RUNNING"/"Agendado".
   Correção: dar à conta técnica um caminho legítimo multiempresa (função `security definer` dedicada por operação, ou papel de serviço com políticas específicas para o id da conta técnica), em vez de depender de `companyId` do worker.

2. **Mídia recebida do WhatsApp falha em empresas diferentes da conta técnica.**
   `app.ts` linhas 529-541 insere `FileAsset` com `companyId: session.companyId`, mas a policy de INSERT exige `companyId = current_company_id()`. Fora da empresa do worker o insert é rejeitado, o arquivo fica órfão no disco e a mensagem é salva sem anexo.
   Correção: mesma solução do item 1; enquanto isso, registrar o erro na mensagem em vez de descartar silenciosamente.

3. **Campanha só inicia se estiver em DRAFT.**
   `app.ts` `/api/campaigns/:id/start` faz claim com `.eq('status','DRAFT')`. Campanhas em `SCHEDULED`, `PAUSED`, `CANCELLED` ou `FINISHED` (por exemplo, finalizada com destinatários `FAILED`) nunca mais podem ser iniciadas: o botão "Iniciar" fica habilitado no frontend e retorna 409 genérico.
   Correção: permitir claim a partir de `DRAFT`, `SCHEDULED` e `PAUSED`, e desabilitar/rotular o botão no frontend conforme o status real.

4. **Perfis novos nascem inativos e o login falha sem explicação.**
   `ensure_profile` cria não-proprietários com `active=false`; em `src/routes/index.tsx` (`ZapModelApp.load`) qualquer perfil inativo dispara `signOut()` e volta à tela de login em branco, sem mensagem. O usuário acha que a senha está errada.
   Correção: distinguir "perfil inativo" de "sessão inválida" e exibir "Seu acesso ainda não foi liberado pelo proprietário."

5. **Arquivos e sessões do WhatsApp ficam em disco efêmero.**
   `uploadDir` e o diretório de auth do Baileys usam o sistema de arquivos do contêiner. Em cada deploy/restart do Railway os anexos somem (download 404) e as sessões exigem novo QR.
   Correção: mover anexos para storage do Lovable Cloud e persistir credenciais do Baileys em tabela/volume.

## Importantes

6. **Permissões OWNER/ADMIN/AGENT não refletidas na UI.**
   Políticas exigem `is_app_admin()` para INSERT/DELETE de `Queue`, `QuickMessage`, `Campaign`, `ApiToken`, `Setting`, `Contact` (delete) e `Ticket` (delete). Em `src/routes/index.tsx` (`SimpleCrud`, `Campaigns`, `Integrations`, `SettingsPage`, `Contacts.del`) os botões aparecem para AGENT e só falham com `alert` de erro cru do PostgREST.
   Correção: esconder/desabilitar as ações por papel e traduzir o erro de permissão.

7. **Tela de Integrações fica vazia para AGENT.**
   `ApiToken` SELECT exige `is_app_admin()`; para agentes a lista volta vazia sem aviso, sugerindo que não há tokens.
   Correção: exibir aviso de permissão insuficiente.

8. **API pública v1 não enxerga tokens de outras empresas.**
   `app.ts` `/api/v1/messages/send` consulta `ApiToken` com o cliente da conta técnica, e a policy exige admin + mesma empresa. Tokens válidos de outras empresas retornam "Token inválido".
   Correção: validação do token por função `security definer` que devolve apenas `companyId` e `active`.

9. **`useData` ignora mudanças de `loader`.**
   `src/routes/index.tsx` linha 132: `reload` tem lista de dependências vazia, então captura o primeiro `loader`. Hoje funciona por causa do `key` por tabela em `SimpleCrud`, mas qualquer nova tela com filtro/paginação vai consultar com o estado antigo.
   Correção: usar `useRef` para o loader mais recente.

10. **Polling sobrescreve estado no Kanban e nos Atendimentos.**
    `Kanban` (linha 226) limpa o `moved` otimista logo após `reload`; se a réplica de leitura ainda devolver o status antigo, o card volta visualmente para a coluna anterior. Em `Tickets`, o intervalo de 2,5 s recarrega as mensagens e pode desfazer a mensagem recém-enviada por instantes.
    Correção: manter o override otimista até o registro retornado confirmar o novo status.

11. **`Dashboard` mascara falhas.**
    `countRows` em `src/lib/db.ts` devolve `0` em qualquer erro; falhas de RLS/rede aparecem como "0 atendimentos".
    Correção: propagar o erro e mostrar o alerta já existente.

12. **Erros exibidos com `alert()` e mensagens cruas do banco.**
    Praticamente todas as ações de `src/routes/index.tsx` usam `alert(e.message)`, expondo texto do PostgREST ("new row violates row-level security policy...").
    Correção: camada de tradução de erros e uso do componente `Alert` já existente.

13. **Agendamento sem conexão fica em espera indefinida.**
    `processSchedules` faz `continue` quando não há sessão conectada, sem registrar tentativa nem motivo; a UI mostra "Aguardando conexão/envio" para sempre.
    Correção: gravar `lastError` informativo (sem consumir tentativa) para o usuário entender.

14. **Socket.IO implementado no worker mas não consumido no frontend.**
    O worker emite `message:created`, `ticket:updated`, `session:updated`, `campaign:finished`, `schedule:sent`, porém a UI só usa polling. Atualizações demoram e há requisições desnecessárias.
    Correção: assinar os eventos no frontend ou remover o custo do lado do worker.

## Menores

15. `Contacts.add` (linha 210) checa duplicidade só na lista já carregada e nunca preenche `whatsappJid`; contatos criados manualmente podem duplicar com os criados pelo WhatsApp.
16. `Tickets.newTicket` usa `prompt` e sempre escolhe `sessions[0]`, sem deixar escolher a conexão.
17. `Campaigns.add` seleciona destinatários por número, então contatos com `number` nulo (só LID) nunca podem ser incluídos.
18. `UsersPage.toggleActive` aparece para AGENT, mas `set_user_active` exige OWNER/ADMIN e devolve exceção crua.
19. `Connections` chama `GET /api/whatsapp` a cada 3 s por sessão aberta; sem worker cai no banco e o QR pode ficar desatualizado.
20. `deleteRow('Contact')` e exclusão de `Queue` não tratam FKs de `Schedule`/`Ticket.queueId`; a mensagem de erro é técnica.
21. `Message.externalId` é único globalmente; teoricamente dois clientes distintos com o mesmo id externo colidem e a mensagem é descartada como duplicada.
22. Nenhum registro em `AuditLog` é gravado pelo app, embora a tabela e as políticas existam.

## Sugestão de ordem de correção

1. Multiempresa do worker (itens 1, 2, 8) — é o que faz recursos "funcionarem na tela" e falharem no fundo.
2. Ciclo de vida de campanhas (3) e feedback de acesso pendente (4).
3. Persistência de arquivos/sessões (5).
4. Permissões na UI e tratamento de erros (6, 7, 11, 12).
5. Ajustes de estado/polling e melhorias menores.
