import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type Request, type Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import {
  background,
  backgroundProfile,
  requireAdmin,
  requireAuth,
  type AuthedRequest
} from './supabase.js';
import { applyConnectionEvent, getSessionById, newId, nowIso, persistIncomingMessage } from './store.js';
import {
  connectSession,
  disconnectSession,
  isSessionConnected,
  sendMedia,
  sendText,
  setWhatsAppEventSink
} from './whatsapp.js';

const app = express();
const server = http.createServer(app);

const origins = (process.env.FRONTEND_URL || '').split(',').map(v => v.trim()).filter(Boolean);
const corsOptions = { origin: origins, credentials: true };
const io = new SocketIOServer(server, { cors: corsOptions });

const uploadDir = process.env.UPLOAD_DIR || path.resolve('data/uploads');
await fs.mkdir(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });

const param = (req: Request, key: string): string => {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] || '' : value || '';
};
const fail = (res: Response, error: unknown, status = 400) =>
  res.status(status).json({ error: error instanceof Error ? error.message : String(error) });

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadDir));

/* ---------------------------- health ---------------------------- */

app.get('/api/health', async (_req, res) => {
  try {
    const db = await background();
    const { error } = await db.from('WhatsAppSession').select('id').limit(1);
    if (error) throw error;
    res.json({ ok: true, service: 'zapmodel-worker', database: 'lovable-cloud', time: nowIso() });
  } catch (e: any) {
    res.status(503).json({ ok: false, database: 'lovable-cloud', error: e?.message });
  }
});

/* --------------------------- whatsapp --------------------------- */

app.get('/api/whatsapp', requireAuth(), async (req: AuthedRequest, res) => {
  const { data, error } = await req
    .db!.from('WhatsAppSession')
    .select('*')
    .eq('companyId', req.auth!.companyId)
    .order('createdAt', { ascending: true });
  if (error) return fail(res, error, 500);
  res.json((data || []).map(row => ({ ...row, connected: isSessionConnected(row.id) })));
});

app.post('/api/whatsapp', requireAuth(), requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const { data, error } = await req
      .db!.from('WhatsAppSession')
      .insert({
        id: newId(),
        companyId: req.auth!.companyId,
        name: String(req.body?.name || 'WhatsApp'),
        isDefault: Boolean(req.body?.isDefault),
        status: 'DISCONNECTED',
        updatedAt: nowIso()
      })
      .select('*')
      .single();
    if (error) throw error;
    await connectSession(data.id);
    res.status(201).json(data);
  } catch (e) {
    fail(res, e, 500);
  }
});

app.post('/api/whatsapp/:id/connect', requireAuth(), requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const row = await getSessionById(req.db!, id);
    if (!row) return res.status(404).json({ error: 'Conexão não encontrada' });
    await connectSession(id);
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.post('/api/whatsapp/:id/disconnect', requireAuth(), requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const row = await getSessionById(req.db!, id);
    if (!row) return res.status(404).json({ error: 'Conexão não encontrada' });
    await disconnectSession(id, Boolean(req.body?.logout));
    res.json({ ok: true });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.delete('/api/whatsapp/:id', requireAuth(), requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const row = await getSessionById(req.db!, id);
    if (!row) return res.status(404).json({ error: 'Conexão não encontrada' });
    await disconnectSession(id, true);
    const { error } = await req.db!.from('WhatsAppSession').delete().eq('id', id);
    if (error) throw error;
    res.status(204).end();
  } catch (e) {
    fail(res, e, 500);
  }
});

/* --------------------------- mensagens -------------------------- */

app.get('/api/tickets/:id/messages', requireAuth(), async (req: AuthedRequest, res) => {
  const id = param(req, 'id');
  const { data, error } = await req
    .db!.from('Message')
    .select('*')
    .eq('ticketId', id)
    .order('createdAt', { ascending: true });
  if (error) return fail(res, error, 500);
  await req.db!.from('Ticket').update({ unread: 0 }).eq('id', id);
  res.json(data || []);
});

app.post('/api/tickets/:id/messages', requireAuth(), upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const ticket = await req
      .db!.from('Ticket')
      .select('id,sessionId,contactId,companyId')
      .eq('id', id)
      .maybeSingle();
    if (ticket.error) throw ticket.error;
    if (!ticket.data) return res.status(404).json({ error: 'Atendimento não encontrado' });

    const sessionId = ticket.data.sessionId as string | null;
    if (!sessionId || !isSessionConnected(sessionId)) {
      return res.status(409).json({ error: 'WhatsApp não está conectado neste atendimento' });
    }

    const contact = await req
      .db!.from('Contact')
      .select('number,whatsappJid')
      .eq('id', ticket.data.contactId)
      .single();
    if (contact.error) throw contact.error;
    const target = { number: contact.data.number as string | null, whatsappJid: contact.data.whatsappJid as string | null };

    const text = String(req.body?.body || '').trim();
    let externalId: string | undefined;
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let resolvedPn: string | null = null;

    if (req.file) {
      const sent = await sendMedia(
        sessionId,
        target,
        await fs.readFile(req.file.path),
        req.file.mimetype,
        req.file.originalname,
        text || undefined
      );
      externalId = (sent.result as any)?.key?.id;
      resolvedPn = sent.resolvedPn;
      mediaUrl = `/uploads/${path.basename(req.file.path)}`;
      mediaType = req.file.mimetype;
    } else {
      if (!text) return res.status(400).json({ error: 'Mensagem vazia' });
      const sent = await sendText(sessionId, target, text);
      externalId = (sent.result as any)?.key?.id;
      resolvedPn = sent.resolvedPn;
    }

    // autocorreção de contatos legados: LID resolvido para número real
    if (resolvedPn && resolvedPn !== target.number) {
      await req
        .db!.from('Contact')
        .update({ number: resolvedPn, updatedAt: nowIso() })
        .eq('id', ticket.data.contactId);
    }


    const inserted = await req
      .db!.from('Message')
      .insert({
        id: newId(),
        ticketId: id,
        body: text || req.file?.originalname || '',
        fromMe: true,
        externalId: externalId ?? null,
        mediaUrl,
        mediaType,
        userId: req.auth!.id,
        updatedAt: nowIso()
      })
      .select('*')
      .single();
    if (inserted.error) throw inserted.error;

    await req
      .db!.from('Ticket')
      .update({ lastMessage: inserted.data.body, status: 'OPEN', updatedAt: nowIso() })
      .eq('id', id);

    io.to(req.auth!.companyId).emit('message:created', { ticketId: id, message: inserted.data });
    res.status(201).json(inserted.data);
  } catch (e) {
    fail(res, e, 500);
  }
});

/* --------------------------- campanhas -------------------------- */

app.post('/api/campaigns/:id/start', requireAuth(), requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const campaign = await req.db!.from('Campaign').select('*').eq('id', id).maybeSingle();
    if (campaign.error) throw campaign.error;
    if (!campaign.data) return res.status(404).json({ error: 'Campanha não encontrada' });

    const session = await req
      .db!.from('WhatsAppSession')
      .select('id')
      .eq('companyId', req.auth!.companyId)
      .eq('status', 'CONNECTED')
      .limit(1)
      .maybeSingle();
    const sessionId = session.data?.id as string | undefined;
    if (!sessionId || !isSessionConnected(sessionId)) {
      return res.status(409).json({ error: 'Nenhuma conexão de WhatsApp disponível' });
    }

    const targets = await req
      .db!.from('CampaignContact')
      .select('contactId,status')
      .eq('campaignId', id)
      .eq('status', 'PENDING');
    if (targets.error) throw targets.error;

    await req
      .db!.from('Campaign')
      .update({ status: 'RUNNING', startedAt: nowIso(), updatedAt: nowIso() })
      .eq('id', id);
    res.json({ ok: true, total: targets.data?.length || 0 });

    void (async () => {
      for (const target of targets.data || []) {
        try {
          const contact = await req
            .db!.from('Contact')
            .select('name,number,whatsappJid')
            .eq('id', target.contactId)
            .single();
          if (contact.error) throw contact.error;
          const body = String(campaign.data.message || '').replace(/\{\{nome\}\}/gi, contact.data.name || '');
          const sent = await sendText(
            sessionId,
            { number: contact.data.number, whatsappJid: contact.data.whatsappJid },
            body
          );
          if (sent.resolvedPn && sent.resolvedPn !== contact.data.number) {
            await req
              .db!.from('Contact')
              .update({ number: sent.resolvedPn, updatedAt: nowIso() })
              .eq('id', target.contactId);
          }

          await req
            .db!.from('CampaignContact')
            .update({ status: 'SENT', error: null })
            .eq('campaignId', id)
            .eq('contactId', target.contactId);
        } catch (err: any) {
          await req
            .db!.from('CampaignContact')
            .update({ status: 'FAILED', error: err?.message || 'Falha no envio' })
            .eq('campaignId', id)
            .eq('contactId', target.contactId);
        }
        await new Promise(r => setTimeout(r, 2500));
      }
      await req
        .db!.from('Campaign')
        .update({ status: 'FINISHED', finishedAt: nowIso(), updatedAt: nowIso() })
        .eq('id', id);
      io.to(req.auth!.companyId).emit('campaign:finished', { id });
    })();
  } catch (e) {
    fail(res, e, 500);
  }
});

/* --------------------------- arquivos --------------------------- */

app.post('/api/files', requireAuth(), upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
    const { data, error } = await req
      .db!.from('FileAsset')
      .insert({
        id: newId(),
        companyId: req.auth!.companyId,
        name: req.file.originalname,
        path: `/uploads/${path.basename(req.file.path)}`,
        mimeType: req.file.mimetype,
        size: req.file.size
      })
      .select('*')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (e) {
    fail(res, e, 500);
  }
});

/* ------------------------ API pública v1 ------------------------ */

app.post('/api/v1/messages/send', async (req, res) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Token obrigatório' });
    const tokenHash = crypto.createHash('sha256').update(header.slice(7)).digest('hex');

    const db = await background();
    const token = await db
      .from('ApiToken')
      .select('id,companyId,active')
      .eq('tokenHash', tokenHash)
      .maybeSingle();
    if (token.error) throw token.error;
    if (!token.data?.active) return res.status(401).json({ error: 'Token inválido' });

    const number = String(req.body?.number || '').replace(/\D/g, '');
    const body = String(req.body?.body || '').trim();
    if (!number || !body) return res.status(400).json({ error: 'Informe number e body' });

    const session = await db
      .from('WhatsAppSession')
      .select('id')
      .eq('companyId', token.data.companyId)
      .eq('status', 'CONNECTED')
      .limit(1)
      .maybeSingle();
    const sessionId = session.data?.id as string | undefined;
    if (!sessionId || !isSessionConnected(sessionId)) {
      return res.status(409).json({ error: 'WhatsApp não está conectado' });
    }

    const sent = await sendText(sessionId, { number }, body);
    res.status(201).json({ ok: true, externalId: (sent.result as any)?.key?.id ?? null });

  } catch (e) {
    fail(res, e, 500);
  }
});

/* ------------------------- eventos Baileys ---------------------- */

setWhatsAppEventSink({
  onConnection: async event => {
    try {
      const session = await applyConnectionEvent(event);
      if (session) io.to(session.companyId).emit('session:updated', { ...session, qr: event.qr ?? null });
    } catch (err) {
      console.error('[worker] falha ao atualizar conexão', err);
    }
  },
  onMessage: async event => {
    try {
      const saved = await persistIncomingMessage(event);
      if (saved) {
        io.to(saved.companyId).emit('message:created', { ticketId: saved.ticketId, message: saved.message });
        io.to(saved.companyId).emit('ticket:updated', { id: saved.ticketId });
      }
    } catch (err) {
      console.error('[worker] falha ao gravar mensagem', err);
    }
  }
});

/* ---------------------------- socket ---------------------------- */

io.use(async (socket, next) => {
  try {
    const token = String(socket.handshake.auth?.token || '');
    if (!token) return next(new Error('Não autenticado'));
    const { userFromToken } = await import('./supabase.js');
    const resolved = await userFromToken(token);
    if (!resolved) return next(new Error('Sessão inválida'));
    socket.join(resolved.user.companyId);
    next();
  } catch (err: any) {
    next(new Error(err?.message || 'Falha na autenticação'));
  }
});

/* ---------------------------- startup --------------------------- */

const port = Number(process.env.PORT || 8080);

async function bootstrap() {
  try {
    const profile = await backgroundProfile();
    console.log(`[worker] conta técnica ativa: ${profile.email} (${profile.role})`);
    const db = await background();
    const { data } = await db.from('WhatsAppSession').select('id').eq('status', 'CONNECTED');
    for (const row of data || []) {
      connectSession(row.id).catch(err => console.error('[worker] reconexão falhou', err));
    }
  } catch (err) {
    console.error('[worker] conta técnica indisponível:', err);
  }
}

server.listen(port, () => {
  console.log(`[worker] ouvindo na porta ${port}`);
  void bootstrap();
});
