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
import {
  checkRateLimit,
  hasValidSignature,
  isAllowedUpload,
  sanitizeUploadName,
  securityHeaders,
  uploadFileFilter,
  validateStoredUpload
} from './security.js';

const app = express();
const server = http.createServer(app);

const configuredOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const defaultOrigins = [
  'https://zapmodel.lovable.app',
  'https://id-preview--37c7559c-ca7c-4862-b0cb-612b1262cbd0.lovable.app'
];
const allowedOrigins = new Set([...configuredOrigins, ...defaultOrigins]);
const corsOptions: cors.CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    callback(new Error('Origem não autorizada'));
  }
};
const io = new SocketIOServer(server, { cors: corsOptions });

const uploadDir = process.env.UPLOAD_DIR || path.resolve('data/uploads');
await fs.mkdir(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: uploadFileFilter
});

const MAX_TEXT = 4096;

const param = (req: Request, key: string): string => {
  const value = req.params[key];
  return Array.isArray(value) ? value[0] || '' : value || '';
};
const fail = (res: Response, error: unknown, status = 400) => {
  console.error('[worker] erro', status, error);
  if (status >= 500) return res.status(status).json({ error: 'Erro interno do serviço.' });
  return res.status(status).json({ error: error instanceof Error ? error.message : String(error) });
};

/** Remove o arquivo temporário quando o conteúdo é rejeitado. */
async function discardUpload(filePath?: string) {
  if (!filePath) return;
  await fs.rm(filePath, { force: true }).catch(() => undefined);
}

app.disable('x-powered-by');
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(express.json({ limit: '256kb' }));

/* ------------------------ health / readiness ---------------------- */

// Liveness: responde enquanto o processo estiver vivo.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'zapmodel-worker', time: nowIso() });
});

// Readiness: valida a conta técnica e o acesso ao Lovable Cloud.
app.get('/api/ready', async (_req, res) => {
  try {
    const db = await background();
    const { error } = await db.from('WhatsAppSession').select('id').limit(1);
    if (error) throw error;
    res.json({ ok: true, service: 'zapmodel-worker', database: 'lovable-cloud', time: nowIso() });
  } catch (e) {
    console.error('[worker] readiness falhou', e);
    res.status(503).json({ ok: false, database: 'lovable-cloud', error: 'Serviço indisponível.' });
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
        name: sanitizeUploadName(String(req.body?.name || 'WhatsApp')).slice(0, 80) || 'WhatsApp',
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
    const linked = await req.db!.from('Ticket').select('id', { count: 'exact', head: true }).eq('sessionId', id);
    if ((linked.count || 0) > 0) return res.status(409).json({ error: 'Esta conexão possui atendimentos vinculados. Desconecte-a em vez de excluir.' });
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
  const ticket = await req.db!.from('Ticket').select('id').eq('id', id).maybeSingle();
  if (ticket.error) return fail(res, ticket.error, 500);
  if (!ticket.data) return res.status(404).json({ error: 'Atendimento não encontrado' });
  const { data, error } = await req.db!.from('Message').select('*').eq('ticketId', id).order('createdAt', { ascending: true });
  if (error) return fail(res, error, 500);
  await req.db!.from('Ticket').update({ unread: 0, updatedAt: nowIso() }).eq('id', id);
  res.json(data || []);
});

app.post('/api/tickets/:id/messages', requireAuth(), upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const ticket = await req.db!.from('Ticket').select('id,sessionId,contactId,companyId').eq('id', id).maybeSingle();
    if (ticket.error) throw ticket.error;
    if (!ticket.data) return res.status(404).json({ error: 'Atendimento não encontrado' });

    const sessionId = ticket.data.sessionId as string | null;
    if (!sessionId || !isSessionConnected(sessionId)) return res.status(409).json({ error: 'WhatsApp não está conectado neste atendimento' });

    const contact = await req.db!.from('Contact').select('number,whatsappJid').eq('id', ticket.data.contactId).single();
    if (contact.error) throw contact.error;
    const target = { number: contact.data.number as string | null, whatsappJid: contact.data.whatsappJid as string | null };

    const text = String(req.body?.body || '').trim().slice(0, MAX_TEXT);
    let externalId: string | undefined;
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let resolvedPn: string | null = null;
    const safeFileName = req.file ? sanitizeUploadName(req.file.originalname) : '';

    if (req.file) {
      const valid = await validateStoredUpload(req.file.path, req.file.mimetype).catch(() => false);
      if (!valid) {
        await discardUpload(req.file.path);
        return res.status(400).json({ error: 'Conteúdo do arquivo não corresponde ao tipo permitido.' });
      }
      const sent = await sendMedia(sessionId, target, await fs.readFile(req.file.path), req.file.mimetype, safeFileName, text || undefined);
      externalId = (sent.result as any)?.key?.id;
      resolvedPn = sent.resolvedPn;
      // Registra o arquivo na biblioteca para ter uma URL de download válida.
      const asset = await req.db!.from('FileAsset').insert({
        id: newId(),
        companyId: req.auth!.companyId,
        name: safeFileName,
        path: path.basename(req.file.path),
        mimeType: req.file.mimetype,
        size: req.file.size
      }).select('id').single();
      if (asset.error) throw asset.error;
      mediaUrl = `/api/files/${asset.data.id}/download`;
      mediaType = req.file.mimetype;

    } else {
      if (!text) return res.status(400).json({ error: 'Mensagem vazia' });
      const sent = await sendText(sessionId, target, text);
      externalId = (sent.result as any)?.key?.id;
      resolvedPn = sent.resolvedPn;
    }

    if (resolvedPn && resolvedPn !== target.number) {
      await req.db!.from('Contact').update({ number: resolvedPn, updatedAt: nowIso() }).eq('id', ticket.data.contactId);
    }

    const inserted = await req.db!.from('Message').insert({
      id: newId(),
      ticketId: id,
      body: text || safeFileName || '',
      fromMe: true,
      externalId: externalId ?? null,
      mediaUrl,
      mediaType,
      userId: req.auth!.id,
      updatedAt: nowIso()
    }).select('*').single();
    if (inserted.error) throw inserted.error;

    await req.db!.from('Ticket').update({ lastMessage: inserted.data.body, status: 'OPEN', updatedAt: nowIso() }).eq('id', id);
    io.to(req.auth!.companyId).emit('message:created', { ticketId: id, message: inserted.data });
    res.status(201).json(inserted.data);
  } catch (e) {
    fail(res, e, 500);
  }
});

/* --------------------------- campanhas -------------------------- */

// Garante que uma campanha não tenha dois loops de envio simultâneos.
const runningCampaigns = new Set<string>();



/** Envia os destinatários PENDING de uma campanha e a finaliza ao terminar. */
async function runCampaign(campaignId: string, companyId: string, sessionId: string, message: string) {
  if (runningCampaigns.has(campaignId)) return;
  runningCampaigns.add(campaignId);
  try {
    const db = await background();
    const targets = await db.from('CampaignContact').select('contactId').eq('campaignId', campaignId).eq('status', 'PENDING');
    if (targets.error) throw targets.error;

    for (const target of targets.data || []) {
      try {
        const contact = await db.from('Contact').select('name,number,whatsappJid').eq('id', target.contactId).single();
        if (contact.error) throw contact.error;
        const body = String(message || '').replace(/\{\{nome\}\}/gi, contact.data.name || '');
        const sent = await sendText(sessionId, { number: contact.data.number, whatsappJid: contact.data.whatsappJid }, body);
        if (sent.resolvedPn && sent.resolvedPn !== contact.data.number) {
          await db.from('Contact').update({ number: sent.resolvedPn, updatedAt: nowIso() }).eq('id', target.contactId);
        }
        await db.from('CampaignContact').update({ status: 'SENT', error: null }).eq('campaignId', campaignId).eq('contactId', target.contactId);
      } catch (err: any) {
        try {
          await db.from('CampaignContact').update({ status: 'FAILED', error: err?.message || 'Falha no envio' }).eq('campaignId', campaignId).eq('contactId', target.contactId);
        } catch (logErr) {
          console.error('[worker] falha ao registrar erro de campanha', logErr);
        }
      }
      await new Promise(r => setTimeout(r, 2500));
    }

    await db.from('Campaign').update({ status: 'FINISHED', finishedAt: nowIso(), updatedAt: nowIso() }).eq('id', campaignId);
    io.to(companyId).emit('campaign:finished', { id: campaignId });
  } catch (err) {
    console.error('[worker] falha ao processar campanha', campaignId, err);
  } finally {
    runningCampaigns.delete(campaignId);
  }
}

/** Retoma campanhas RUNNING após reinício e finaliza as que não têm pendências. */
async function resumeCampaigns() {
  try {
    const db = await background();
    const running = await db.from('Campaign').select('id,companyId,message').eq('status', 'RUNNING');
    if (running.error) throw running.error;
    for (const campaign of running.data || []) {
      const pending = await db.from('CampaignContact').select('contactId', { count: 'exact', head: true }).eq('campaignId', campaign.id).eq('status', 'PENDING');
      if (!pending.count) {
        await db.from('Campaign').update({ status: 'FINISHED', finishedAt: nowIso(), updatedAt: nowIso() }).eq('id', campaign.id);
        continue;
      }
      const session = await db.from('WhatsAppSession').select('id').eq('companyId', campaign.companyId).eq('status', 'CONNECTED').limit(1).maybeSingle();
      const sessionId = session.data?.id as string | undefined;
      if (!sessionId || !isSessionConnected(sessionId)) continue;
      void runCampaign(campaign.id, campaign.companyId, sessionId, String(campaign.message || ''));
    }
  } catch (err) {
    console.error('[worker] falha ao retomar campanhas', err);
  }
}

app.post('/api/campaigns/:id/start', requireAuth(), requireAdmin, async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const campaign = await req.db!.from('Campaign').select('*').eq('id', id).maybeSingle();
    if (campaign.error) throw campaign.error;
    if (!campaign.data) return res.status(404).json({ error: 'Campanha não encontrada' });
    if (campaign.data.status === 'RUNNING') return res.status(409).json({ error: 'Esta campanha já está em execução' });

    const session = await req.db!.from('WhatsAppSession').select('id').eq('companyId', req.auth!.companyId).eq('status', 'CONNECTED').limit(1).maybeSingle();
    const sessionId = session.data?.id as string | undefined;
    if (!sessionId || !isSessionConnected(sessionId)) return res.status(409).json({ error: 'Nenhuma conexão de WhatsApp disponível' });

    const targets = await req.db!.from('CampaignContact').select('contactId', { count: 'exact', head: true }).eq('campaignId', id).eq('status', 'PENDING');
    if (targets.error) throw targets.error;
    if (!targets.count) return res.status(400).json({ error: 'A campanha não possui destinatários pendentes' });

    // Transição atômica: apenas um pedido consegue sair de DRAFT para RUNNING.
    const claimed = await req.db!
      .from('Campaign')
      .update({ status: 'RUNNING', startedAt: nowIso(), finishedAt: null, updatedAt: nowIso() })
      .eq('id', id)
      .eq('status', 'DRAFT')
      .select('id');
    if (claimed.error) throw claimed.error;
    if (!claimed.data?.length) return res.status(409).json({ error: 'Esta campanha já está em execução' });

    res.json({ ok: true, total: targets.count });
    void runCampaign(id, req.auth!.companyId, sessionId, String(campaign.data.message || ''));
  } catch (e) {
    fail(res, e, 500);
  }
});


/* --------------------------- arquivos --------------------------- */

app.post('/api/files', requireAuth(), upload.single('file'), async (req: AuthedRequest, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' });
    const valid = await validateStoredUpload(req.file.path, req.file.mimetype).catch(() => false);
    if (!valid) {
      await discardUpload(req.file.path);
      return res.status(400).json({ error: 'Conteúdo do arquivo não corresponde ao tipo permitido.' });
    }
    const { data, error } = await req.db!.from('FileAsset').insert({
      id: newId(),
      companyId: req.auth!.companyId,
      name: sanitizeUploadName(req.file.originalname),
      path: path.basename(req.file.path),
      mimeType: req.file.mimetype,
      size: req.file.size
    }).select('*').single();
    if (error) throw error;
    res.status(201).json({ ...data, downloadUrl: `/api/files/${data.id}/download` });
  } catch (e) {
    fail(res, e, 500);
  }
});

app.get('/api/files/:id/download', requireAuth(), async (req: AuthedRequest, res) => {
  try {
    const id = param(req, 'id');
    const asset = await req.db!.from('FileAsset').select('*').eq('id', id).maybeSingle();
    if (asset.error) throw asset.error;
    if (!asset.data) return res.status(404).json({ error: 'Arquivo não encontrado' });
    const filePath = path.join(uploadDir, path.basename(String(asset.data.path || '')));
    await fs.access(filePath);
    res.type(asset.data.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(sanitizeUploadName(String(asset.data.name || 'arquivo')))}`);
    res.sendFile(filePath);
  } catch (e) {
    console.error('[worker] falha no download', e);
    res.status(404).json({ error: 'Arquivo não encontrado' });
  }
});

/* ------------------------ API pública v1 ------------------------ */

app.post('/api/v1/messages/send', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const xApiKey = Array.isArray(req.headers['x-api-key']) ? req.headers['x-api-key'][0] : req.headers['x-api-key'];
    const plainToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : String(xApiKey || '');
    if (!plainToken) return res.status(401).json({ error: 'Token obrigatório em Authorization: Bearer ou X-API-Key' });
    const tokenHash = crypto.createHash('sha256').update(plainToken).digest('hex');
    if (!checkRateLimit(tokenHash, 60, 60_000)) return res.status(429).json({ error: 'Limite de requisições excedido. Tente novamente em instantes.' });

    const db = await background();
    const token = await db.from('ApiToken').select('id,companyId,active').eq('tokenHash', tokenHash).maybeSingle();
    if (token.error) throw token.error;
    if (!token.data?.active) return res.status(401).json({ error: 'Token inválido' });

    const number = String(req.body?.number || '').replace(/\D/g, '');
    const body = String(req.body?.body ?? req.body?.message ?? '').trim();
    if (number.length < 8 || number.length > 15) return res.status(400).json({ error: 'Informe um number válido com 8 a 15 dígitos' });
    if (body.length < 1 || body.length > MAX_TEXT) return res.status(400).json({ error: 'Informe body (ou message) com 1 a 4096 caracteres' });

    const session = await db.from('WhatsAppSession').select('id').eq('companyId', token.data.companyId).eq('status', 'CONNECTED').limit(1).maybeSingle();
    const sessionId = session.data?.id as string | undefined;
    if (!sessionId || !isSessionConnected(sessionId)) return res.status(409).json({ error: 'WhatsApp não está conectado' });

    const sent = await sendText(sessionId, { number }, body);
    res.status(201).json({ ok: true, externalId: (sent.result as any)?.key?.id ?? null });
  } catch (e) {
    fail(res, e, 500);
  }
});

/* ---------------------- agendamentos reais ---------------------- */

let scheduleBusy = false;
async function processSchedules() {
  if (scheduleBusy) return;
  scheduleBusy = true;
  try {
    const db = await background();
    const due = await db
      .from('Schedule')
      .select('id,body,contactNumber,companyId,scheduledAt,attempts')
      .is('sentAt', null)
      .lt('attempts', 5)
      .lte('scheduledAt', nowIso())
      .order('scheduledAt', { ascending: true })
      .limit(20);
    if (due.error) throw due.error;

    for (const item of due.data || []) {
      const attempts = Number(item.attempts || 0);
      try {
        const session = await db.from('WhatsAppSession').select('id').eq('companyId', item.companyId).eq('status', 'CONNECTED').limit(1).maybeSingle();
        const sessionId = session.data?.id as string | undefined;
        if (!sessionId || !isSessionConnected(sessionId)) continue;
        const number = String(item.contactNumber || '').replace(/\D/g, '');
        const body = String(item.body || '').trim();
        if (!number || !body) {
          await db.from('Schedule').update({ attempts: 5, lastError: 'Número ou mensagem inválidos', updatedAt: nowIso() }).eq('id', item.id);
          continue;
        }
        await sendText(sessionId, { number }, body);
        await db.from('Schedule').update({ sentAt: nowIso(), lastError: null, updatedAt: nowIso() }).eq('id', item.id).is('sentAt', null);
        io.to(item.companyId).emit('schedule:sent', { id: item.id });
      } catch (err: any) {
        console.error('[worker] falha em agendamento', item.id, err);
        try {
          await db
            .from('Schedule')
            .update({ attempts: attempts + 1, lastError: String(err?.message || 'Falha no envio'), updatedAt: nowIso() })
            .eq('id', item.id);
        } catch (logErr) {
          console.error('[worker] falha ao registrar erro de agendamento', logErr);
        }
      }
    }

  } catch (err) {
    console.error('[worker] falha ao processar agendamentos', err);
  } finally {
    scheduleBusy = false;
  }
}

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
      // Mídia recebida vira arquivo na biblioteca com URL de download válida.
      const mediaAllowed = event.media
        ? isAllowedUpload(event.media.mimeType, event.media.fileName) && hasValidSignature(event.media.buffer, event.media.mimeType)
        : false;
      if (event.media && !mediaAllowed) {
        console.error('[worker] mídia recebida rejeitada por tipo/assinatura inválidos');
      }
      if (event.media && mediaAllowed) {
        try {
          const db = await background();
          const session = await getSessionById(db, event.sessionId);
          if (session) {
            const safeName = sanitizeUploadName(event.media.fileName).replace(/[^\w.\-]+/g, '_').slice(-80) || 'arquivo';
            const storedName = `${newId()}-${safeName}`;
            await fs.writeFile(path.join(uploadDir, storedName), event.media.buffer);
            const asset = await db
              .from('FileAsset')
              .insert({
                id: newId(),
                companyId: session.companyId,
                name: safeName,
                path: storedName,
                mimeType: event.media.mimeType,
                size: event.media.buffer.length
              })
              .select('id')
              .single();
            if (asset.error) throw asset.error;
            event.mediaUrl = `/api/files/${asset.data.id}/download`;
            event.mediaType = event.media.mimeType;
          }
        } catch (mediaErr) {
          console.error('[worker] falha ao salvar mídia recebida', mediaErr);
        }
      }

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
    const { data, error } = await db
      .from('WhatsAppSession')
      .select('id,status')
      .in('status', ['CONNECTED', 'CONNECTING', 'QRCODE', 'ERROR']);
    if (error) throw error;
    for (const row of data || []) {
      connectSession(row.id).catch(err => console.error('[worker] reconexão falhou', row.id, err));
    }
    await processSchedules();
    await resumeCampaigns();

  } catch (err) {
    console.error('[worker] conta técnica indisponível:', err);
  }
}

server.listen(port, () => {
  console.log(`[worker] ouvindo na porta ${port}`);
  void bootstrap();
  setInterval(() => void processSchedules(), 30_000).unref();
});
