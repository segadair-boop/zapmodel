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

export type IncomingMedia = { buffer: Buffer; mimeType: string; fileName: string };

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
  /** Mídia baixada do WhatsApp, quando a mensagem for de arquivo. */
  media?: IncomingMedia;
  /** Preenchido pelo app após persistir o arquivo na biblioteca. */
  mediaUrl?: string | null;
  mediaType?: string | null;
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
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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

/** Tenta mapear um LID para o número real via signalRepository. */
async function lidToPn(sock: WASocket, lid: string): Promise<string | null> {
  try {
    const mapping = (sock as any)?.signalRepository?.lidMapping;
    const pn = await mapping?.getPNForLID?.(lid);
    return normalizeJid(typeof pn === 'string' ? pn : null);
  } catch {
    return null;
  }
}

/**
 * O mapeamento LID -> PN pode ser populado pouco depois do evento da mensagem.
 * Faz tentativas curtas antes de concluir que o número ainda não está disponível.
 */
async function lidToPnWithRetry(sock: WASocket, lid: string): Promise<string | null> {
  const delays = [0, 120, 350, 800];
  for (const delay of delays) {
    if (delay) await wait(delay);
    const pn = await lidToPn(sock, lid);
    if (pn && isPnJid(pn)) return pn;
  }
  return null;
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
    const pn = await lidToPnWithRetry(sock, remoteJid);
    if (pn && isPnJid(pn)) return { whatsappJid: remoteJid, number: numberFromPnJid(pn) };
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
      const peer = await resolvePeer(sock, message);
      await sink.onMessage?.({
        sessionId,
        remoteJid,
        whatsappJid: peer.whatsappJid,
        number: peer.number,
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

function pnJidFor(number: string) {
  const clean = number.replace(/\D/g, '');
  if (!clean) throw new Error('Número de telefone inválido');
  return `${clean}@s.whatsapp.net`;
}

/**
 * Resolve o destino de envio. Aceita número puro ou alvo com whatsappJid.
 * Retorna o JID a usar e, quando aplicável, o PN resolvido a partir de um LID.
 */
async function resolveSendTarget(
  sock: WASocket,
  target: SendTarget | string
): Promise<{ jid: string; resolvedPn: string | null }> {
  const normalized: SendTarget = typeof target === 'string' ? { number: target } : target;
  const storedJid = normalizeJid(normalized.whatsappJid);
  const number = (normalized.number || '').replace(/\D/g, '');

  if (storedJid && isLid(storedJid)) {
    const pn = await lidToPnWithRetry(sock, storedJid);
    if (pn && isPnJid(pn)) return { jid: pn, resolvedPn: numberFromPnJid(pn) };
    // Se o contato já possui número real cadastrado, prioriza o PN em vez de exibir/enviar ao LID cru.
    if (number) return { jid: pnJidFor(number), resolvedPn: number };
    return { jid: storedJid, resolvedPn: null };
  }

  if (storedJid && isPnJid(storedJid)) return { jid: storedJid, resolvedPn: numberFromPnJid(storedJid) };
  if (number) return { jid: pnJidFor(number), resolvedPn: number };
  throw new Error('Destino de envio inválido');
}

export async function sendText(sessionId: string, target: SendTarget | string, text: string): Promise<SendResult> {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('WhatsApp não está conectado');
  const { jid, resolvedPn } = await resolveSendTarget(sock, target);
  const result = await sock.sendMessage(jid, { text });
  return { result, resolvedPn };
}

export async function sendMedia(
  sessionId: string,
  target: SendTarget | string,
  media: Buffer,
  mimeType: string,
  fileName: string,
  caption?: string
): Promise<SendResult> {
  const sock = sockets.get(sessionId);
  if (!sock) throw new Error('WhatsApp não está conectado');
  const { jid, resolvedPn } = await resolveSendTarget(sock, target);
  let result: unknown;
  if (mimeType.startsWith('image/')) result = await sock.sendMessage(jid, { image: media, caption });
  else if (mimeType.startsWith('video/')) result = await sock.sendMessage(jid, { video: media, caption });
  else if (mimeType.startsWith('audio/')) result = await sock.sendMessage(jid, { audio: media, mimetype: mimeType, ptt: false });
  else result = await sock.sendMessage(jid, { document: media, mimetype: mimeType, fileName, caption });
  return { result, resolvedPn };
}
