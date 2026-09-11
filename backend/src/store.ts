import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { background } from './supabase.js';
import type { ConnectionEvent, IncomingMessageEvent } from './whatsapp.js';

export const newId = () => crypto.randomUUID();
export const nowIso = () => new Date().toISOString();

export type SessionRow = { id: string; name: string; companyId: string; status: string; phone: string | null };

export async function getSessionById(db: SupabaseClient, sessionId: string): Promise<SessionRow | null> {
  const { data, error } = await db
    .from('WhatsAppSession')
    .select('id,name,companyId,status,phone')
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as SessionRow) || null;
}

/** Atualiza status/QR/telefone da conexão no Lovable Cloud. */
export async function applyConnectionEvent(event: ConnectionEvent): Promise<SessionRow | null> {
  const db = await background();
  const patch: Record<string, unknown> = { status: event.status, updatedAt: nowIso() };
  if ('qr' in event) patch['qr'] = event.qr ?? null;
  if (event.phone !== undefined && event.phone !== null) patch['phone'] = event.phone;

  const { data, error } = await db
    .from('WhatsAppSession')
    .update(patch)
    .eq('id', event.sessionId)
    .select('id,name,companyId,status,phone')
    .maybeSingle();
  if (error) throw error;
  return (data as SessionRow) || null;
}

type ContactRow = { id: string; name: string; number: string; companyId: string; whatsappJid: string | null };
const isLid = (jid?: string | null) => Boolean(jid && jid.endsWith('@lid'));

/** Localiza por JID e depois por número, autocorrigindo contatos legados. */
export async function findOrCreateContact(
  db: SupabaseClient,
  companyId: string,
  opts: { number: string | null; whatsappJid: string | null; name?: string }
): Promise<ContactRow> {
  const cols = 'id,name,number,companyId,whatsappJid';
  const normalizedNumber = opts.number ? opts.number.replace(/\D/g, '') : null;
  let found: ContactRow | null = null;

  if (opts.whatsappJid) {
    const byJid = await db.from('Contact').select(cols).eq('companyId', companyId).eq('whatsappJid', opts.whatsappJid).maybeSingle();
    if (byJid.error) throw byJid.error;
    found = (byJid.data as ContactRow) || null;
  }

  if (!found && normalizedNumber) {
    const byNumber = await db.from('Contact').select(cols).eq('companyId', companyId).eq('number', normalizedNumber).maybeSingle();
    if (byNumber.error) throw byNumber.error;
    found = (byNumber.data as ContactRow) || null;
  }

  if (!found && opts.whatsappJid && isLid(opts.whatsappJid)) {
    const lidDigits = opts.whatsappJid.split('@')[0]!.replace(/\D/g, '');
    if (lidDigits) {
      const legacy = await db.from('Contact').select(cols).eq('companyId', companyId).eq('number', lidDigits).maybeSingle();
      if (legacy.error) throw legacy.error;
      found = (legacy.data as ContactRow) || null;
    }
  }

  if (found) {
    const patch: Record<string, unknown> = {};
    if (opts.whatsappJid && found.whatsappJid !== opts.whatsappJid) patch['whatsappJid'] = opts.whatsappJid;
    if (normalizedNumber && found.number !== normalizedNumber) patch['number'] = normalizedNumber;
    if (opts.name && (!found.name || found.name === found.number || isLid(found.whatsappJid))) patch['name'] = opts.name;
    if (Object.keys(patch).length === 0) return found;
    patch['updatedAt'] = nowIso();
    const updated = await db.from('Contact').update(patch).eq('id', found.id).select(cols).single();
    if (updated.error) throw updated.error;
    return updated.data as ContactRow;
  }

  const fallbackName = opts.name || normalizedNumber || opts.whatsappJid || 'Contato';
  const created = await db
    .from('Contact')
    .insert({
      id: newId(),
      companyId,
      number: normalizedNumber || opts.whatsappJid || newId(),
      whatsappJid: opts.whatsappJid,
      name: fallbackName,
      updatedAt: nowIso()
    })
    .select(cols)
    .single();
  if (created.error) throw created.error;
  return created.data as ContactRow;
}

type TicketRow = { id: string; status: string; unread: number };

async function lookupOpenTicket(db: SupabaseClient, companyId: string, contactId: string, sessionId: string): Promise<TicketRow | null> {
  const result = await db
    .from('Ticket')
    .select('id,status,unread')
    .eq('companyId', companyId)
    .eq('contactId', contactId)
    .eq('sessionId', sessionId)
    .neq('status', 'CLOSED')
    .order('createdAt', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (result.error) throw result.error;
  return (result.data as TicketRow) || null;
}

/**
 * Retorna um único ticket ativo por empresa + contato + conexão.
 * O índice parcial no banco é a proteção definitiva contra condição de corrida.
 * Se dois eventos tentarem criar ao mesmo tempo, um INSERT vence e o outro
 * recebe 23505; nesse caso buscamos e reutilizamos o ticket vencedor.
 */
async function findOrCreateTicket(db: SupabaseClient, companyId: string, contactId: string, sessionId: string): Promise<TicketRow> {
  const existing = await lookupOpenTicket(db, companyId, contactId, sessionId);
  if (existing) return existing;

  const created = await db
    .from('Ticket')
    .insert({ id: newId(), companyId, contactId, sessionId, status: 'OPEN', unread: 0, updatedAt: nowIso() })
    .select('id,status,unread')
    .single();

  if (!created.error) return created.data as TicketRow;

  // PostgreSQL unique_violation: outro evento criou o mesmo atendimento entre
  // nossa consulta e o INSERT. Reutilizamos o registro já criado.
  if ((created.error as any)?.code === '23505') {
    const winner = await lookupOpenTicket(db, companyId, contactId, sessionId);
    if (winner) return winner;
  }

  throw created.error;
}

export type PersistedIncoming = {
  companyId: string;
  ticketId: string;
  contactId: string;
  message: Record<string, unknown>;
};

/** Persiste mensagem do Baileys com idempotência por externalId. */
export async function persistIncomingMessage(event: IncomingMessageEvent): Promise<PersistedIncoming | null> {
  const db = await background();
  const session = await getSessionById(db, event.sessionId);
  if (!session) return null;

  if (event.externalId) {
    const existingMessage = await db
      .from('Message')
      .select('id,ticketId')
      .eq('externalId', event.externalId)
      .limit(1)
      .maybeSingle();
    if (existingMessage.error) throw existingMessage.error;
    if (existingMessage.data) return null;
  }

  const contact = await findOrCreateContact(db, session.companyId, {
    number: event.number,
    whatsappJid: event.whatsappJid,
    name: event.pushName || event.number || undefined
  });

  const ticket = await findOrCreateTicket(db, session.companyId, contact.id, event.sessionId);

  const inserted = await db
    .from('Message')
    .insert({
      id: newId(),
      ticketId: ticket.id,
      body: event.body,
      fromMe: event.fromMe,
      externalId: event.externalId ?? null,
      ack: event.fromMe ? 1 : 0,
      updatedAt: nowIso()
    })
    .select('*')
    .single();

  if (inserted.error) {
    // O mesmo externalId também pode chegar em paralelo. A constraint única
    // garante idempotência; nesse caso não recriamos ticket nem mensagem.
    if ((inserted.error as any)?.code === '23505' && event.externalId) return null;
    throw inserted.error;
  }

  const { error: ticketError } = await db
    .from('Ticket')
    .update({
      lastMessage: event.body,
      unread: event.fromMe ? ticket.unread || 0 : (ticket.unread || 0) + 1,
      sessionId: event.sessionId,
      status: 'OPEN',
      updatedAt: nowIso()
    })
    .eq('id', ticket.id);
  if (ticketError) throw ticketError;

  return {
    companyId: session.companyId,
    ticketId: ticket.id,
    contactId: contact.id,
    message: inserted.data as Record<string, unknown>
  };
}
