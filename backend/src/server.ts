import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { Server as SocketIOServer } from 'socket.io';
import { PrismaClient, CampaignStatus, ConnectionStatus, TicketStatus, UserRole } from '@prisma/client';
import { connectSession, disconnectSession, isSessionConnected, sendMedia, sendText, setWhatsAppEventSink } from './whatsapp.js';

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(v => v.trim()).filter(Boolean);
const io = new SocketIOServer(server, { cors: { origin: allowedOrigins.length ? allowedOrigins : true, credentials: true } });
const uploadDir = process.env.UPLOAD_DIR || path.resolve('data/uploads');
await fs.mkdir(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir, limits: { fileSize: 25 * 1024 * 1024 } });

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadDir));

const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';

type AuthPayload = { sub: string; companyId: string; role: UserRole; email: string };
type AuthedRequest = Request & { auth?: AuthPayload };

function signToken(user: { id: string; companyId: string; role: UserRole; email: string }) {
  return jwt.sign({ companyId: user.companyId, role: user.role, email: user.email }, jwtSecret, { subject: user.id, expiresIn: (process.env.JWT_EXPIRES_IN || '8h') as any });
}

function auth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Não autenticado' });
  try {
    req.auth = jwt.verify(header.slice(7), jwtSecret) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Sessão inválida ou expirada' });
  }
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth || !['OWNER', 'ADMIN'].includes(req.auth.role)) return res.status(403).json({ error: 'Permissão insuficiente' });
  next();
}

async function audit(req: AuthedRequest, action: string, entity: string, entityId?: string, details?: unknown) {
  if (!req.auth) return;
  await prisma.auditLog.create({ data: { action, entity, entityId, details: details as any, userId: req.auth.sub, companyId: req.auth.companyId } }).catch(() => undefined);
}

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'zapmodel-backend', database: 'ok', time: new Date().toISOString() });
  } catch (error: any) {
    res.status(503).json({ ok: false, database: 'error', error: error?.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const user = await prisma.user.findUnique({ where: { email }, include: { company: true } });
  if (!user?.active || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  res.json({ token: signToken(user), user: { id: user.id, name: user.name, email: user.email, role: user.role, companyId: user.companyId, company: user.company } });
});

app.get('/api/auth/me', auth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findFirst({ where: { id: req.auth!.sub, companyId: req.auth!.companyId }, select: { id: true, name: true, email: true, role: true, active: true, companyId: true } });
  res.json(user);
});

app.get('/api/dashboard', auth, async (req: AuthedRequest, res) => {
  const companyId = req.auth!.companyId;
  const [open, pending, closed, contacts, messages, sessions, campaigns] = await Promise.all([
    prisma.ticket.count({ where: { companyId, status: TicketStatus.OPEN } }),
    prisma.ticket.count({ where: { companyId, status: TicketStatus.PENDING } }),
    prisma.ticket.count({ where: { companyId, status: TicketStatus.CLOSED } }),
    prisma.contact.count({ where: { companyId } }),
    prisma.message.count({ where: { ticket: { companyId } } }),
    prisma.whatsAppSession.count({ where: { companyId, status: ConnectionStatus.CONNECTED } }),
    prisma.campaign.count({ where: { companyId } })
  ]);
  res.json({ open, pending, closed, contacts, messages, connectedSessions: sessions, campaigns });
});

app.get('/api/contacts', auth, async (req: AuthedRequest, res) => {
  const q = String(req.query.q || '').trim();
  const rows = await prisma.contact.findMany({ where: { companyId: req.auth!.companyId, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { number: { contains: q } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) }, orderBy: { name: 'asc' } });
  res.json(rows);
});

app.post('/api/contacts', auth, async (req: AuthedRequest, res) => {
  const name = String(req.body?.name || '').trim();
  const number = String(req.body?.number || '').replace(/\D/g, '');
  if (!name || !number) return res.status(400).json({ error: 'Nome e número são obrigatórios' });
  const row = await prisma.contact.upsert({ where: { companyId_number: { companyId: req.auth!.companyId, number } }, update: { name, email: req.body.email || null, notes: req.body.notes || null }, create: { name, number, email: req.body.email || null, notes: req.body.notes || null, companyId: req.auth!.companyId } });
  await audit(req, 'UPSERT', 'Contact', row.id, { number });
  io.to(req.auth!.companyId).emit('contact:updated', row);
  res.status(201).json(row);
});

app.patch('/api/contacts/:id', auth, async (req: AuthedRequest, res) => {
  const existing = await prisma.contact.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Contato não encontrado' });
  const row = await prisma.contact.update({ where: { id: existing.id }, data: { name: req.body.name ?? undefined, email: req.body.email ?? undefined, notes: req.body.notes ?? undefined } });
  await audit(req, 'UPDATE', 'Contact', row.id);
  res.json(row);
});

app.delete('/api/contacts/:id', auth, async (req: AuthedRequest, res) => {
  const existing = await prisma.contact.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Contato não encontrado' });
  await prisma.contact.delete({ where: { id: existing.id } });
  await audit(req, 'DELETE', 'Contact', existing.id);
  res.status(204).end();
});

app.get('/api/queues', auth, async (req: AuthedRequest, res) => res.json(await prisma.queue.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { name: 'asc' } })));
app.post('/api/queues', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const row = await prisma.queue.create({ data: { companyId: req.auth!.companyId, name: String(req.body.name || 'Nova fila'), color: req.body.color || '#22c55e', greeting: req.body.greeting || null } });
  await audit(req, 'CREATE', 'Queue', row.id);
  res.status(201).json(row);
});
app.patch('/api/queues/:id', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await prisma.queue.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Fila não encontrada' });
  const row = await prisma.queue.update({ where: { id: existing.id }, data: { name: req.body.name ?? undefined, color: req.body.color ?? undefined, greeting: req.body.greeting ?? undefined, active: req.body.active ?? undefined } });
  res.json(row);
});
app.delete('/api/queues/:id', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const existing = await prisma.queue.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Fila não encontrada' });
  await prisma.queue.delete({ where: { id: existing.id } }); res.status(204).end();
});

app.get('/api/tickets', auth, async (req: AuthedRequest, res) => {
  const status = String(req.query.status || '').toUpperCase();
  const where: any = { companyId: req.auth!.companyId };
  if (['OPEN', 'PENDING', 'CLOSED'].includes(status)) where.status = status;
  const rows = await prisma.ticket.findMany({ where, include: { contact: true, queue: true, user: { select: { id: true, name: true } }, session: { select: { id: true, name: true, status: true } }, tags: { include: { tag: true } } }, orderBy: { updatedAt: 'desc' } });
  res.json(rows);
});

app.post('/api/tickets', auth, async (req: AuthedRequest, res) => {
  const number = String(req.body?.number || '').replace(/\D/g, '');
  if (!number) return res.status(400).json({ error: 'Número obrigatório' });
  const contact = await prisma.contact.upsert({ where: { companyId_number: { companyId: req.auth!.companyId, number } }, update: { name: req.body.name || undefined }, create: { companyId: req.auth!.companyId, number, name: req.body.name || number } });
  const ticket = await prisma.ticket.create({ data: { companyId: req.auth!.companyId, contactId: contact.id, queueId: req.body.queueId || null, sessionId: req.body.sessionId || null, userId: req.auth!.sub }, include: { contact: true, queue: true, session: true } });
  io.to(req.auth!.companyId).emit('ticket:created', ticket);
  res.status(201).json(ticket);
});

app.get('/api/tickets/:id/messages', auth, async (req: AuthedRequest, res) => {
  const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!ticket) return res.status(404).json({ error: 'Atendimento não encontrado' });
  await prisma.ticket.update({ where: { id: ticket.id }, data: { unread: 0 } });
  res.json(await prisma.message.findMany({ where: { ticketId: ticket.id }, orderBy: { createdAt: 'asc' } }));
});

app.post('/api/tickets/:id/messages', auth, upload.single('file'), async (req: AuthedRequest, res) => {
  const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId }, include: { contact: true } });
  if (!ticket) return res.status(404).json({ error: 'Atendimento não encontrado' });
  const text = String(req.body?.body || '').trim();
  if (!ticket.sessionId) return res.status(400).json({ error: 'Atendimento não possui conexão WhatsApp vinculada' });
  if (!isSessionConnected(ticket.sessionId)) return res.status(409).json({ error: 'WhatsApp não está conectado' });
  let externalId: string | undefined;
  let mediaUrl: string | undefined;
  let mediaType: string | undefined;
  if (req.file) {
    const data = await fs.readFile(req.file.path);
    const sent: any = await sendMedia(ticket.sessionId, ticket.contact.number, data, req.file.mimetype, req.file.originalname, text || undefined);
    externalId = sent?.key?.id;
    mediaUrl = `/uploads/${path.basename(req.file.path)}`;
    mediaType = req.file.mimetype;
  } else {
    if (!text) return res.status(400).json({ error: 'Mensagem vazia' });
    const sent: any = await sendText(ticket.sessionId, ticket.contact.number, text);
    externalId = sent?.key?.id;
  }
  const message = await prisma.message.create({ data: { ticketId: ticket.id, body: text || req.file?.originalname || '', fromMe: true, externalId, mediaUrl, mediaType, userId: req.auth!.sub } });
  const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { lastMessage: message.body, status: TicketStatus.OPEN } });
  io.to(req.auth!.companyId).emit('message:created', { ticketId: ticket.id, message });
  io.to(req.auth!.companyId).emit('ticket:updated', updated);
  res.status(201).json(message);
});

app.patch('/api/tickets/:id', auth, async (req: AuthedRequest, res) => {
  const existing = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!existing) return res.status(404).json({ error: 'Atendimento não encontrado' });
  const data: any = {};
  if (req.body.status && ['OPEN', 'PENDING', 'CLOSED'].includes(String(req.body.status).toUpperCase())) data.status = String(req.body.status).toUpperCase();
  if ('queueId' in req.body) data.queueId = req.body.queueId || null;
  if ('userId' in req.body) data.userId = req.body.userId || null;
  if ('sessionId' in req.body) data.sessionId = req.body.sessionId || null;
  const row = await prisma.ticket.update({ where: { id: existing.id }, data, include: { contact: true, queue: true, session: true } });
  await audit(req, 'UPDATE', 'Ticket', row.id, data);
  io.to(req.auth!.companyId).emit('ticket:updated', row);
  res.json(row);
});

app.get('/api/whatsapp', auth, async (req: AuthedRequest, res) => res.json(await prisma.whatsAppSession.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { createdAt: 'asc' } })));
app.post('/api/whatsapp', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const row = await prisma.whatsAppSession.create({ data: { companyId: req.auth!.companyId, name: String(req.body.name || 'WhatsApp'), isDefault: Boolean(req.body.isDefault) } });
  await connectSession(row.id);
  res.status(201).json(row);
});
app.post('/api/whatsapp/:id/connect', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const row = await prisma.whatsAppSession.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!row) return res.status(404).json({ error: 'Conexão não encontrada' });
  await connectSession(row.id); res.json({ ok: true });
});
app.post('/api/whatsapp/:id/disconnect', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const row = await prisma.whatsAppSession.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!row) return res.status(404).json({ error: 'Conexão não encontrada' });
  await disconnectSession(row.id, Boolean(req.body?.logout)); res.json({ ok: true });
});
app.delete('/api/whatsapp/:id', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const row = await prisma.whatsAppSession.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!row) return res.status(404).json({ error: 'Conexão não encontrada' });
  await disconnectSession(row.id, true); await prisma.whatsAppSession.delete({ where: { id: row.id } }); res.status(204).end();
});

app.get('/api/quick-messages', auth, async (req: AuthedRequest, res) => res.json(await prisma.quickMessage.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { shortcut: 'asc' } })));
app.post('/api/quick-messages', auth, async (req: AuthedRequest, res) => res.status(201).json(await prisma.quickMessage.create({ data: { companyId: req.auth!.companyId, shortcut: String(req.body.shortcut || ''), message: String(req.body.message || '') } })));
app.delete('/api/quick-messages/:id', auth, async (req: AuthedRequest, res) => { const row = await prisma.quickMessage.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); if (!row) return res.status(404).json({ error: 'Não encontrado' }); await prisma.quickMessage.delete({ where: { id: row.id } }); res.status(204).end(); });

app.get('/api/tags', auth, async (req: AuthedRequest, res) => res.json(await prisma.tag.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { name: 'asc' } })));
app.post('/api/tags', auth, async (req: AuthedRequest, res) => res.status(201).json(await prisma.tag.create({ data: { companyId: req.auth!.companyId, name: String(req.body.name || 'Etiqueta'), color: req.body.color || '#64748b' } })));
app.post('/api/tickets/:id/tags/:tagId', auth, async (req: AuthedRequest, res) => { const ticket = await prisma.ticket.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); const tag = await prisma.tag.findFirst({ where: { id: req.params.tagId, companyId: req.auth!.companyId } }); if (!ticket || !tag) return res.status(404).json({ error: 'Não encontrado' }); await prisma.ticketTag.upsert({ where: { ticketId_tagId: { ticketId: ticket.id, tagId: tag.id } }, update: {}, create: { ticketId: ticket.id, tagId: tag.id } }); res.json({ ok: true }); });

app.get('/api/schedules', auth, async (req: AuthedRequest, res) => res.json(await prisma.schedule.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { scheduledAt: 'asc' } })));
app.post('/api/schedules', auth, async (req: AuthedRequest, res) => res.status(201).json(await prisma.schedule.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.sub, title: String(req.body.title || 'Agendamento'), body: req.body.body || null, contactNumber: req.body.contactNumber || null, scheduledAt: new Date(req.body.scheduledAt) } })));
app.patch('/api/schedules/:id', auth, async (req: AuthedRequest, res) => { const row = await prisma.schedule.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); if (!row) return res.status(404).json({ error: 'Não encontrado' }); res.json(await prisma.schedule.update({ where: { id: row.id }, data: { title: req.body.title ?? undefined, body: req.body.body ?? undefined, scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : undefined } })); });
app.delete('/api/schedules/:id', auth, async (req: AuthedRequest, res) => { const row = await prisma.schedule.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); if (!row) return res.status(404).json({ error: 'Não encontrado' }); await prisma.schedule.delete({ where: { id: row.id } }); res.status(204).end(); });

app.get('/api/tasks', auth, async (req: AuthedRequest, res) => res.json(await prisma.task.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { createdAt: 'desc' } })));
app.post('/api/tasks', auth, async (req: AuthedRequest, res) => res.status(201).json(await prisma.task.create({ data: { companyId: req.auth!.companyId, userId: req.auth!.sub, title: String(req.body.title || 'Tarefa'), description: req.body.description || null, dueAt: req.body.dueAt ? new Date(req.body.dueAt) : null } })));
app.patch('/api/tasks/:id', auth, async (req: AuthedRequest, res) => { const row = await prisma.task.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); if (!row) return res.status(404).json({ error: 'Não encontrado' }); res.json(await prisma.task.update({ where: { id: row.id }, data: { title: req.body.title ?? undefined, description: req.body.description ?? undefined, status: req.body.status ?? undefined, dueAt: req.body.dueAt ? new Date(req.body.dueAt) : undefined } })); });
app.delete('/api/tasks/:id', auth, async (req: AuthedRequest, res) => { const row = await prisma.task.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); if (!row) return res.status(404).json({ error: 'Não encontrado' }); await prisma.task.delete({ where: { id: row.id } }); res.status(204).end(); });

app.get('/api/campaigns', auth, async (req: AuthedRequest, res) => res.json(await prisma.campaign.findMany({ where: { companyId: req.auth!.companyId }, include: { _count: { select: { contacts: true } } }, orderBy: { createdAt: 'desc' } })));
app.post('/api/campaigns', auth, async (req: AuthedRequest, res) => {
  const contactIds: string[] = Array.isArray(req.body.contactIds) ? req.body.contactIds : [];
  const row = await prisma.campaign.create({ data: { companyId: req.auth!.companyId, name: String(req.body.name || 'Campanha'), message: String(req.body.message || ''), scheduledAt: req.body.scheduledAt ? new Date(req.body.scheduledAt) : null, contacts: { create: contactIds.map(contactId => ({ contactId })) } } });
  res.status(201).json(row);
});
app.post('/api/campaigns/:id/start', auth, async (req: AuthedRequest, res) => {
  const row = await prisma.campaign.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } });
  if (!row) return res.status(404).json({ error: 'Campanha não encontrada' });
  await prisma.campaign.update({ where: { id: row.id }, data: { status: CampaignStatus.RUNNING, startedAt: new Date() } });
  res.json({ ok: true });
});

app.get('/api/users', auth, requireAdmin, async (req: AuthedRequest, res) => res.json(await prisma.user.findMany({ where: { companyId: req.auth!.companyId }, select: { id: true, name: true, email: true, role: true, active: true, createdAt: true }, orderBy: { name: 'asc' } })));
app.post('/api/users', auth, requireAdmin, async (req: AuthedRequest, res) => {
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
  const row = await prisma.user.create({ data: { companyId: req.auth!.companyId, name: String(req.body.name || ''), email: String(req.body.email || '').toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: (req.body.role || 'AGENT') as UserRole } });
  res.status(201).json({ id: row.id, name: row.name, email: row.email, role: row.role, active: row.active });
});
app.patch('/api/users/:id', auth, requireAdmin, async (req: AuthedRequest, res) => { const row = await prisma.user.findFirst({ where: { id: req.params.id, companyId: req.auth!.companyId } }); if (!row) return res.status(404).json({ error: 'Usuário não encontrado' }); const data: any = { name: req.body.name ?? undefined, role: req.body.role ?? undefined, active: req.body.active ?? undefined }; if (req.body.password) data.passwordHash = await bcrypt.hash(String(req.body.password), 12); const updated = await prisma.user.update({ where: { id: row.id }, data }); res.json({ id: updated.id, name: updated.name, email: updated.email, role: updated.role, active: updated.active }); });

app.get('/api/settings', auth, async (req: AuthedRequest, res) => res.json(await prisma.setting.findMany({ where: { companyId: req.auth!.companyId } })));
app.put('/api/settings/:key', auth, requireAdmin, async (req: AuthedRequest, res) => res.json(await prisma.setting.upsert({ where: { companyId_key: { companyId: req.auth!.companyId, key: req.params.key } }, update: { value: String(req.body.value ?? '') }, create: { companyId: req.auth!.companyId, key: req.params.key, value: String(req.body.value ?? '') } })));

app.get('/api/files', auth, async (req: AuthedRequest, res) => res.json(await prisma.fileAsset.findMany({ where: { companyId: req.auth!.companyId }, orderBy: { createdAt: 'desc' } })));
app.post('/api/files', auth, upload.single('file'), async (req: AuthedRequest, res) => { if (!req.file) return res.status(400).json({ error: 'Arquivo obrigatório' }); const row = await prisma.fileAsset.create({ data: { companyId: req.auth!.companyId, name: req.file.originalname, path: `/uploads/${path.basename(req.file.path)}`, mimeType: req.file.mimetype, size: req.file.size } }); res.status(201).json(row); });

app.get('/api/api-tokens', auth, requireAdmin, async (req: AuthedRequest, res) => res.json(await prisma.apiToken.findMany({ where: { companyId: req.auth!.companyId }, select: { id: true, name: true, active: true, createdAt: true } })));
app.post('/api/api-tokens', auth, requireAdmin, async (req: AuthedRequest, res) => { const plain = `zm_${crypto.randomBytes(32).toString('hex')}`; const tokenHash = crypto.createHash('sha256').update(plain).digest('hex'); const row = await prisma.apiToken.create({ data: { companyId: req.auth!.companyId, name: String(req.body.name || 'API'), tokenHash } }); res.status(201).json({ ...row, token: plain, tokenHash: undefined }); });

app.get('/api/audit', auth, requireAdmin, async (req: AuthedRequest, res) => res.json(await prisma.auditLog.findMany({ where: { companyId: req.auth!.companyId }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 500 })));

async function apiTokenAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = String(req.headers['x-api-key'] || req.headers.authorization?.replace(/^Bearer\s+/i, '') || '');
  if (!token) return res.status(401).json({ error: 'API key obrigatória' });
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const row = await prisma.apiToken.findFirst({ where: { tokenHash, active: true } });
  if (!row) return res.status(401).json({ error: 'API key inválida' });
  req.auth = { sub: 'api', companyId: row.companyId, role: UserRole.ADMIN, email: 'api@zapmodel.local' };
  next();
}

app.post('/api/v1/messages/send', apiTokenAuth, async (req: AuthedRequest, res) => {
  const session = req.body.sessionId ? await prisma.whatsAppSession.findFirst({ where: { id: req.body.sessionId, companyId: req.auth!.companyId } }) : await prisma.whatsAppSession.findFirst({ where: { companyId: req.auth!.companyId, status: ConnectionStatus.CONNECTED }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
  if (!session || !isSessionConnected(session.id)) return res.status(409).json({ error: 'Nenhuma conexão WhatsApp disponível' });
  const result: any = await sendText(session.id, String(req.body.number || ''), String(req.body.message || ''));
  res.json({ ok: true, messageId: result?.key?.id });
});

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || String(socket.handshake.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const payload = jwt.verify(token, jwtSecret) as AuthPayload;
    socket.data.auth = payload;
    next();
  } catch { next(new Error('unauthorized')); }
});
io.on('connection', socket => { const payload = socket.data.auth as AuthPayload; socket.join(payload.companyId); });

setWhatsAppEventSink({
  onConnection: async event => {
    const row = await prisma.whatsAppSession.update({ where: { id: event.sessionId }, data: { status: event.status as ConnectionStatus, qr: event.qr ?? undefined, phone: event.phone ?? undefined } }).catch(() => null);
    if (row) io.to(row.companyId).emit('whatsapp:status', { ...row, error: event.error });
  },
  onMessage: async event => {
    const session = await prisma.whatsAppSession.findUnique({ where: { id: event.sessionId } });
    if (!session) return;
    const contact = await prisma.contact.upsert({ where: { companyId_number: { companyId: session.companyId, number: event.number } }, update: { name: event.pushName || undefined }, create: { companyId: session.companyId, number: event.number, name: event.pushName || event.number } });
    let ticket = await prisma.ticket.findFirst({ where: { companyId: session.companyId, contactId: contact.id, status: { in: [TicketStatus.OPEN, TicketStatus.PENDING] } }, orderBy: { updatedAt: 'desc' } });
    if (!ticket) ticket = await prisma.ticket.create({ data: { companyId: session.companyId, contactId: contact.id, sessionId: session.id, status: TicketStatus.OPEN } });
    const message = await prisma.message.upsert({ where: { externalId: event.externalId || `local-${crypto.randomUUID()}` }, update: {}, create: { externalId: event.externalId, ticketId: ticket.id, body: event.body, fromMe: event.fromMe } });
    const unread = event.fromMe ? ticket.unread : ticket.unread + 1;
    const updated = await prisma.ticket.update({ where: { id: ticket.id }, data: { lastMessage: event.body, unread, sessionId: session.id, status: TicketStatus.OPEN } });
    io.to(session.companyId).emit('message:created', { ticketId: ticket.id, message });
    io.to(session.companyId).emit('ticket:updated', updated);
  }
});

async function restoreWhatsAppSessions() {
  const sessions = await prisma.whatsAppSession.findMany({ where: { status: { in: [ConnectionStatus.CONNECTED, ConnectionStatus.CONNECTING, ConnectionStatus.QRCODE, ConnectionStatus.ERROR] } } });
  for (const session of sessions) connectSession(session.id).catch(console.error);
}

async function runScheduledJobs() {
  const now = new Date();
  const schedules = await prisma.schedule.findMany({ where: { sentAt: null, scheduledAt: { lte: now }, contactNumber: { not: null } }, take: 50 });
  for (const schedule of schedules) {
    const session = await prisma.whatsAppSession.findFirst({ where: { companyId: schedule.companyId, status: ConnectionStatus.CONNECTED }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (!session || !schedule.contactNumber || !schedule.body || !isSessionConnected(session.id)) continue;
    try { await sendText(session.id, schedule.contactNumber, schedule.body); await prisma.schedule.update({ where: { id: schedule.id }, data: { sentAt: new Date() } }); } catch (error) { console.error(error); }
  }

  const campaigns = await prisma.campaign.findMany({ where: { OR: [{ status: CampaignStatus.RUNNING }, { status: CampaignStatus.SCHEDULED, scheduledAt: { lte: now } }] }, include: { contacts: { where: { status: 'PENDING' }, include: { contact: true }, take: 10 } } });
  for (const campaign of campaigns) {
    if (campaign.status === CampaignStatus.SCHEDULED) await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.RUNNING, startedAt: new Date() } });
    const session = await prisma.whatsAppSession.findFirst({ where: { companyId: campaign.companyId, status: ConnectionStatus.CONNECTED }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    if (!session || !isSessionConnected(session.id)) continue;
    for (const target of campaign.contacts) {
      try { await sendText(session.id, target.contact.number, campaign.message); await prisma.campaignContact.update({ where: { campaignId_contactId: { campaignId: campaign.id, contactId: target.contactId } }, data: { status: 'SENT', error: null } }); await new Promise(r => setTimeout(r, 1500)); }
      catch (error: any) { await prisma.campaignContact.update({ where: { campaignId_contactId: { campaignId: campaign.id, contactId: target.contactId } }, data: { status: 'ERROR', error: error?.message || 'Falha no envio' } }); }
    }
    const pending = await prisma.campaignContact.count({ where: { campaignId: campaign.id, status: 'PENDING' } });
    if (!pending) await prisma.campaign.update({ where: { id: campaign.id }, data: { status: CampaignStatus.FINISHED, finishedAt: new Date() } });
  }
}

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => { console.error(err); res.status(err?.status || 500).json({ error: err?.message || 'Erro interno do servidor' }); });

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', async () => {
  console.log(`ZapModel backend ativo na porta ${port}`);
  await restoreWhatsAppSessions().catch(console.error);
  setInterval(() => runScheduledJobs().catch(console.error), 15000);
});

process.on('SIGTERM', async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); });
process.on('SIGINT', async () => { await prisma.$disconnect(); server.close(() => process.exit(0)); });
