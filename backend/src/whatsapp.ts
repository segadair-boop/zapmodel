import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState, type WASocket, type WAMessage } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';

export type ConnectionEvent = {
  sessionId: string;
  status: 'DISCONNECTED' | 'CONNECTING' | 'QRCODE' | 'CONNECTED' | 'ERROR';
  qr?: string | null;
  phone?: string | null;
  error?: string;
};

export type IncomingMessageEvent = {
  sessionId: string;
  remoteJid: string;
  /** JID endereçável do contato (pode ser @lid quando não há PN conhecido). */
  whatsappJid: string;
  /** Número real (PN) quando conhecido; null para LIDs não resolvidos. */
  number: string | null;
  pushName?: string;
  body: string;
  fromMe: boolean;
  externalId?: string;
  raw: WAMessage;
};

/** Destino de envio: número real e/ou JID armazenado no contato. */
export type SendTarget = {
  number?: string | null;
  whatsappJid?: string | null;
};

export type SendResult = {
  result: unknown;
  /** PN resolvido a partir de um LID, para autocorreção do contato. */
  resolvedPn: string | null;
};


type EventSink = {
  onConnection?: (event: ConnectionEvent) => Promise<void> | void;
  onMessage?: (event: IncomingMessageEvent) => Promise<void> | void;
};

const sockets = new Map<string, WASocket>();
const reconnecting = new Set<string>();
const authRoot = process.env.WA_AUTH_DIR || path.resolve('data/wa-auth');
const logger = pino({ level: process.env.LOG_LEVEL || 'warn' });
let sink: EventSink = {};

export function setWhatsAppEventSink(next: EventSink) {
  sink = next;
}

function getBody(message: WAMessage): string {
  const m = message.message;
  if (!m) return '';
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    ''
  );
}

const isLid = (jid?: string | null) => Boolean(jid && jid.endsWith('@lid'));
const isPnJid = (jid?: string | null) => Boolean(jid && jid.endsWith('@s.whatsapp.net'));

/** Normaliza um JID de usuário removendo device/agent (ex.: 55...:12@s.whatsapp.net). */
function normalizeJid(jid?: string | null): string | null {
  if (!jid) return null;
  const [user, server] = jid.split('@');
  if (!user || !server) return null;
  const bare = user.split(':')[0]!.split('_')[0]!;
  return `${bare}@${server}`;
}

/** Extrai o número real apenas de JIDs de telefone (nunca de @lid). */
function numberFromPnJid(jid?: string | null): string | null {
  const normalized = normalizeJid(jid);
  if (!normalized || !isPnJid(normalized)) return null;
  const digits = normalized.split('@')[0]!.replace(/\D/g, '');
  return digits || null;
}

/** Tenta mapear um LID para o número real via signalRepository (Baileys 6.7.x). */
async function lidToPn(sock: WASocket, lid: string): Promise<string | null> {
  try {
    const mapping = (sock as any)?.signalRepository?.lidMapping;
    const pn = await mapping?.getPNForLID?.(lid);
    return normalizeJid(typeof pn === 'string' ? pn : null);
  } catch {
    return null;
  }
}

/** Resolve o JID endereçável do contato e o número real, quando existir. */
async function resolvePeer(
  sock: WASocket,
  message: WAMessage
): Promise<{ whatsappJid: string; number: string | null }> {
  const key = message.key as any;
  const remoteJid = normalizeJid(key.remoteJid)!;
  const candidates = [key.remoteJidAlt, key.senderPn, key.participantPn, (message as any).senderPn]
    .map(normalizeJid)
    .filter(isPnJid) as string[];

  if (candidates[0]) return { whatsappJid: candidates[0], number: numberFromPnJid(candidates[0]) };

  if (isLid(remoteJid)) {
    const pn = await lidToPn(sock, remoteJid);
    if (pn && isPnJid(pn)) return { whatsappJid: pn, number: numberFromPnJid(pn) };
    return { whatsappJid: remoteJid, number: null };
  }

  return { whatsappJid: remoteJid, number: numberFromPnJid(remoteJid) };
}



export async function connectSession(sessionId: string) {
  if (sockets.has(sessionId)) return;
  await fs.mkdir(authRoot, { recursive: true });
  const sessionDir = path.join(authRoot, sessionId);
  await fs.mkdir(sessionDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  await sink.onConnection?.({ sessionId, status: 'CONNECTING', qr: null });

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['ZapModel', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: true
  });

  sockets.set(sessionId, sock);
  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      const dataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 360 });
      await sink.onConnection?.({ sessionId, status: 'QRCODE', qr: dataUrl });
    }

    if (connection === 'open') {
      reconnecting.delete(sessionId);
      const phone = sock.user?.id?.split(':')[0]?.split('@')[0] || null;
      await sink.onConnection?.({ sessionId, status: 'CONNECTED', qr: null, phone });
    }

    if (connection === 'close') {
      sockets.delete(sessionId);
      const error: any = lastDisconnect?.error;
      const statusCode = error?.output?.statusCode || error?.data?.statusCode || error?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      await sink.onConnection?.({
        sessionId,
        status: loggedOut ? 'DISCONNECTED' : 'ERROR',
        qr: null,
        error: error?.message || 'Conexão encerrada'
      });
      if (!loggedOut && !reconnecting.has(sessionId)) {
        reconnecting.add(sessionId);
        setTimeout(() => {
          reconnecting.delete(sessionId);
          connectSession(sessionId).catch(err => logger.error(err));
        }, 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      const remoteJid = message.key.remoteJid;
      if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) continue;
      const body = getBody(message);
      if (!body && !message.message) continue;
      const number = remoteJid.replace(/\D/g, '');
      await sink.onMessage?.({
        sessionId,
        remoteJid,
        number,
        pushName: message.pushName || undefined,
        body,
        fromMe: Boolean(message.key.fromMe),
        externalId: message.key.id || undefined,
        raw: message
      });
    }
  });
}

export async function disconnectSession(sessionId: string, logout = false) {
  const sock = sockets.get(sessionId);
  if (sock) {
    if (logout) await sock.logout().catch(() => undefined);
    sock.end(undefined);
    sockets.delete(sessionId);
  }
  if (logout) await fs.rm(path.join(authRoot, sessionId), { recursive: true, force: true });
  await sink.onConnection?.({ sessionId, status: 'DISCONNECTED', qr: null });
}

export function isSessionConnected(sessionId: string) {
  return sockets.has(sessionId);
}

function jidFor(number: string) {
  const clean = number.replace(/\D/g, '');
  if (!clean) throw new Error('Número de telefone inválido');
  return `${clean}@s.whatsapp.net`;
}

export async function sendText(sessionId: string, number: string, text: string) {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('WhatsApp não está conectado');
  return sock.sendMessage(jidFor(number), { text });
}

export async function sendMedia(sessionId: string, number: string, media: Buffer, mimeType: string, fileName: string, caption?: string) {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('WhatsApp não está conectado');
  const jid = jidFor(number);
  if (mimeType.startsWith('image/')) return sock.sendMessage(jid, { image: media, caption });
  if (mimeType.startsWith('video/')) return sock.sendMessage(jid, { video: media, caption });
  if (mimeType.startsWith('audio/')) return sock.sendMessage(jid, { audio: media, mimetype: mimeType, ptt: false });
  return sock.sendMessage(jid, { document: media, mimetype: mimeType, fileName, caption });
}
