-- Garante no banco que uma empresa não possua dois atendimentos ativos
-- para o mesmo contato na mesma conexão de WhatsApp.
-- Tickets CLOSED continuam podendo gerar um novo atendimento no futuro.

create unique index if not exists "Ticket_one_active_per_contact_session"
on public."Ticket" ("companyId", "contactId", "sessionId")
where status <> 'CLOSED'::"TicketStatus"
  and "sessionId" is not null;
