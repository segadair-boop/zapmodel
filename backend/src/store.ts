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

async function findOrCreateContact(db: SupabaseClient, companyId: string, number: string, name: string) {
  const existing = await db
    .from('Contact')
    .select('id,name,number,companyId')
    .eq('companyId', companyId)
    .eq('number', number)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as { id: string; name: string; number: string; companyId: string };

  const created = await db
    .from('Contact')
    .insert({ id: newId(), companyId, number, name: name || number, updatedAt: nowIso() })
    .select('id,name,number,companyId')
    .single();
  if (created.error) throw created.error;
  return created.data as { id: string; name: string; number: string; companyId: string };
}

async function findOrCreateTicket(db: SupabaseClient, companyId: string, contactId: string, sessionId: string) {
  const existing = await db
    .from('Ticket')
    .select('id,status,unread')
    .eq('companyId', companyId)
    .eq('contactId', contactId)
    .neq('status', 'CLOSED')
    .order('updatedAt', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as { id: string; status: string; unread: number };

  const created = await db
    .from('Ticket')
    .insert({ id: newId(), companyId, contactId, sessionId, status: 'OPEN', unread: 0, updatedAt: nowIso() })
    .select('id,status,unread')
    .single();
  if (created.error) throw created.error;
  return created.data as { id: string; status: string; unread: number };
}

export type PersistedIncoming = {
  companyId: string;
  ticketId: string;
  contactId: string;
  message: Record<string, unknown>;
};

/** Persiste uma mensagem recebida do Baileys usando a conta técnica. */
export async function persistIncomingMessage(event: IncomingMessageEvent): Promise<PersistedIncoming | null> {
  const db = await background();
  const session = await getSessionById(db, event.sessionId);
  if (!session) return null;

  const contact = await findOrCreateContact(db, session.companyId, event.number, event.pushName || event.number);
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
  if (inserted.error) throw inserted.error;

  const { error: ticketError } = await db
    .from('Ticket')
    .update({
      lastMessage: event.body,
      unread: event.fromMe ? 0 : (ticket.unread || 0) + 1,
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
