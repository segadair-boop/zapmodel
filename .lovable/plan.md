# Auditoria técnica do ZapModel

Nenhum arquivo foi alterado. Abaixo estão as falhas encontradas, em ordem de prioridade.

## Críticas (segurança / perda de dados)

1. **Qualquer pessoa que se cadastrar entra na sua empresa**
   `ensure_profile` (banco) + `src/routes/signup.tsx`. O cadastro é público e confirmado automaticamente; o perfil criado sempre é anexado à primeira empresa existente (hoje há apenas 1). Ou seja, um estranho que se cadastre passa a ver contatos, atendimentos, mensagens e campanhas. Correção: exigir convite/aprovação (usuário criado inativo e liberado pelo proprietário) ou criar empresa própria para cada novo cadastro.

2. **Arquivos enviados ficam públicos**
   `backend/src/app.ts` (`app.use('/uploads', express.static(uploadDir))`). Qualquer pessoa com o link baixa o arquivo, sem login. Correção: servir por rota autenticada ou usar o armazenamento do Lovable Cloud com URLs assinadas.

3. **Conta técnica do worker presa a uma única empresa**
   `backend/src/supabase.ts` + `backend/src/store.ts`. Todas as gravações em segundo plano (mensagens recebidas, status/QR das conexões) passam pela conta técnica, cujas políticas limitam a empresa dela. Com mais de uma empresa, mensagens recebidas de outras empresas são silenciosamente descartadas (só aparece no log do worker). Correção: função no banco com permissão controlada para gravação de eventos, ou política específica para a conta técnica.

4. **Token da API não funciona para outras empresas e a documentação está errada**
   `backend/src/app.ts` (`/api/v1/messages/send`) busca o token pela conta técnica, que só enxerga tokens da própria empresa. Além disso a tela de Integrações diz "Header X-API-Key" e campo "message", enquanto o worker exige `Authorization: Bearer` e campo `body`. Resultado: integração externa falha em 100% dos casos. Correção: alinhar documentação e liberar a consulta do token por função no banco.

## Altas (fluxo que grava, mas não executa)

5. **Agendamentos nunca são enviados**
   `src/routes/index.tsx` (`Schedules`). O agendamento é gravado e mostra "Enviado: Não" para sempre — não existe nenhum job que processe a fila. Correção: rotina periódica no worker (ou tarefa agendada) que envia e marca `sentAt`.

6. **Campanha "inicia" sem ter destinatários**
   `src/routes/index.tsx` (`Campaigns`) e `backend/src/app.ts`. Não há tela para adicionar contatos à campanha, então a lista é sempre vazia: a campanha vai para "Em execução" e logo "Finalizada" sem enviar nada. Correção: seleção de contatos/tags ao criar a campanha.

7. **Sem worker configurado, a mensagem é gravada mas não sai no WhatsApp**
   `src/routes/index.tsx` (`Tickets.send`, `Campaigns.start`). No caminho alternativo o sistema grava a mensagem no banco e marca campanha como "em execução", dando a impressão de envio. Correção: bloquear a ação e avisar que a conexão não está disponível.

8. **Campanha em execução morre no meio**
   `backend/src/app.ts`. O laço de envio usa o token do usuário que clicou (expira em ~1h) e roda só em memória: se o worker reiniciar, a campanha fica travada em "Em execução" para sempre, e um segundo clique reenvia tudo. Correção: processar por lote persistido, com a conta técnica, e bloquear início duplicado.

## Médias (consistência e usabilidade)

9. **Status de conexão pode ficar mentindo**
   `backend/src/app.ts` (bootstrap) e `whatsapp.ts`. Se o worker cair, o banco continua com "CONECTADO"; na volta só reconecta sessões marcadas como CONECTADO — sessões em "QRCODE"/"ERRO" ficam paradas. Correção: marcar todas como desconectadas ao subir e então reconectar.

10. **Atendimentos não atualizam sozinhos**
    `src/routes/index.tsx` (`Tickets`). A lista recarrega a cada 4s, mas as mensagens da conversa aberta só carregam ao trocar de atendimento; o Socket.IO do worker nunca é usado pelo site. Mensagem nova só aparece se você sair e voltar.

11. **Contador de não lidas nunca zera**
    A zeragem está no endpoint do worker (`GET /api/tickets/:id/messages`), mas o site lê as mensagens direto do banco. O badge fica preso.

12. **Kanban: cartão movido nunca volta a acompanhar o banco**
    `src/routes/index.tsx` (`Kanban`). O ajuste local (`moved`) nunca é limpo após o sucesso, então uma mudança feita por outro usuário no mesmo cartão não aparece mais nesta sessão.

13. **Não é possível iniciar um atendimento pelo sistema**
    Não há criação de atendimento/contato→ticket na interface; só existe atendimento se o cliente mandar mensagem primeiro.

14. **Exclusões falham por vínculo**
    Excluir contato com atendimento, ou conexão usada por atendimentos, retorna erro de banco cru em um `alert`. Correção: tratar vínculo (bloquear com mensagem clara ou desvincular).

15. **Contatos duplicados**
    Não há restrição de número único por empresa; o cadastro manual pelo `prompt` não normaliza o número, então o mesmo cliente pode virar dois registros e o WhatsApp cria um terceiro.

16. **Usuários e Configurações incompletos**
    A tela de Usuários avisa que o proprietário "pode ajustar o perfil aqui", mas não há edição de perfil nem ativar/desativar. Em Configurações, salvar com o campo Valor vazio é aceito.

17. **CORS depende de variável e derruba tudo se faltar**
    `backend/src/app.ts`. Sem `FRONTEND_URL` a lista de origens fica vazia e o site é bloqueado; o domínio de pré-visualização também não está incluído.

18. **Erros aparecem só como `alert` com texto técnico**
    Em quase todos os módulos o erro do banco vai direto para um `alert`, o que confunde e esconde a causa real.

## Observações menores

- Arquivos e sessão do WhatsApp gravam em disco do container: sem volume persistente no Railway, tudo se perde a cada deploy (o README já pede volume, vale confirmar que está montado).
- Uploads são salvos sem extensão, o que atrapalha abrir o arquivo depois.
- O rótulo "Preview / Produção" no topo depende apenas de a variável do worker existir, não de ele estar no ar.
- Papel AGENT tem praticamente os mesmos poderes de ADMIN nas tabelas de negócio (só tokens e conexões são restritos).

## Sugestão de ordem de correção

1. Fechar o cadastro público e os arquivos públicos (itens 1 e 2).
2. Corrigir a gravação em segundo plano e a API de token (itens 3 e 4).
3. Fazer agendamentos e campanhas realmente enviarem (itens 5 a 8).
4. Consistência de status, tempo real e não lidas (itens 9 a 12).
5. Ajustes de cadastro, exclusão e mensagens de erro (itens 13 a 18).
