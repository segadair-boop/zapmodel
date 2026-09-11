import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { NextFunction, Request, Response } from 'express';

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são obrigatórias');
}

export type AppRole = 'OWNER' | 'ADMIN' | 'AGENT';

export type AppUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  active: boolean;
  companyId: string;
};

export type AuthedRequest = Request & {
  auth?: AppUser;
  db?: SupabaseClient;
};

const anonOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
} as const;

/** Cliente sem sessão, usado apenas para validar o token do usuário. */
const verifier = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, anonOptions);

/** Cliente que executa como o usuário da requisição (RLS aplicado). */
export function clientForToken(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    ...anonOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } }
  });
}

/* ------------------------------------------------------------------ */
/* Conta técnica para operações em background do Baileys               */
/* ------------------------------------------------------------------ */

const WORKER_EMAIL = (process.env.WORKER_EMAIL || '').trim().toLowerCase();
const WORKER_PASSWORD = process.env.WORKER_PASSWORD || '';

export const backgroundClient: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
});

let backgroundReady: Promise<void> | null = null;

async function authenticateBackground(): Promise<void> {
  if (!WORKER_EMAIL || !WORKER_PASSWORD) {
    throw new Error('WORKER_EMAIL e WORKER_PASSWORD são obrigatórias para as tarefas em segundo plano');
  }

  const signIn = await backgroundClient.auth.signInWithPassword({
    email: WORKER_EMAIL,
    password: WORKER_PASSWORD
  });

  if (!signIn.error) {
    await backgroundClient.rpc('ensure_profile', { p_name: 'ZapModel Worker' });
    return;
  }

  const signUp = await backgroundClient.auth.signUp({
    email: WORKER_EMAIL,
    password: WORKER_PASSWORD,
    options: { data: { name: 'ZapModel Worker' } }
  });
  if (signUp.error) throw signUp.error;

  if (!signUp.data.session) {
    const retry = await backgroundClient.auth.signInWithPassword({
      email: WORKER_EMAIL,
      password: WORKER_PASSWORD
    });
    if (retry.error) throw retry.error;
  }

  await backgroundClient.rpc('ensure_profile', { p_name: 'ZapModel Worker' });
}

/** Garante uma sessão válida da conta técnica, renovando quando necessário. */
export async function background(): Promise<SupabaseClient> {
  if (!backgroundReady) {
    backgroundReady = authenticateBackground().catch(err => {
      backgroundReady = null;
      throw err;
    });
  }
  await backgroundReady;

  const { data } = await backgroundClient.auth.getSession();
  const expiresAt = data.session?.expires_at ? data.session.expires_at * 1000 : 0;
  if (!data.session || expiresAt - Date.now() < 60_000) {
    const refreshed = await backgroundClient.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      backgroundReady = null;
      return background();
    }
  }
  return backgroundClient;
}

export async function backgroundProfile(): Promise<AppUser> {
  const db = await background();
  const { data: auth } = await db.auth.getUser();
  const { data, error } = await db
    .from('User')
    .select('id,name,email,role,active,companyId')
    .eq('id', auth.user?.id || '')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Perfil da conta técnica não encontrado');
  return data as AppUser;
}

/* ------------------------------------------------------------------ */
/* Middlewares HTTP                                                    */
/* ------------------------------------------------------------------ */

export async function userFromToken(accessToken: string): Promise<{ user: AppUser; db: SupabaseClient } | null> {
  const { data, error } = await verifier.auth.getUser(accessToken);
  if (error || !data.user) return null;

  const db = clientForToken(accessToken);
  const profile = await db
    .from('User')
    .select('id,name,email,role,active,companyId')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profile.error || !profile.data) return null;
  const user = profile.data as AppUser;
  if (!user.active) return null;
  return { user, db };
}

export function requireAuth() {
  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }
    try {
      const resolved = await userFromToken(header.slice(7));
      if (!resolved) {
        res.status(401).json({ error: 'Sessão inválida ou expirada' });
        return;
      }
      req.auth = resolved.user;
      req.db = resolved.db;
      next();
    } catch {
      res.status(401).json({ error: 'Sessão inválida ou expirada' });
    }
  };
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.auth && (req.auth.role === 'OWNER' || req.auth.role === 'ADMIN')) {
    next();
    return;
  }
  res.status(403).json({ error: 'Permissão insuficiente' });
}
