import { cookies } from 'next/headers';
import { getDb, getEnv } from '@/lib/db';
import { sign, verify, generateId } from '@/lib/crypto';
import type { AuthUser } from '@/lib/auth';

const COOKIE_NAME = 'dash_session';
const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days

export async function createSession(userId: string, ip?: string, userAgent?: string): Promise<string> {
  const env = await getEnv();
  const sessionId = generateId();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const signature = await sign(sessionId, env.SESSION_SECRET);
  const token = `${sessionId}.${signature}`;

  await env.SESSION_KV.put(
    `session:${sessionId}`,
    JSON.stringify({ userId, expiresAt, ip, userAgent }),
    { expirationTtl: SESSION_TTL }
  );

  const db = await getDb();
  await db.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)`
  ).bind(sessionId, userId, expiresAt, ip ?? null, userAgent ?? null).run();

  return token;
}

export async function validateSession(token: string): Promise<AuthUser | null> {
  const env = await getEnv();
  const [sessionId, signature] = token.split('.');
  if (!sessionId || !signature) return null;

  const valid = await verify(sessionId, signature, env.SESSION_SECRET);
  if (!valid) return null;

  const session = await env.SESSION_KV.get(`session:${sessionId}`, 'json') as { userId: string; expiresAt: number } | null;
  if (!session) return null;
  if (session.expiresAt <= Math.floor(Date.now() / 1000)) return null;

  const db = await getDb();
  const user = await db.prepare(
    'SELECT id, email, name, plan FROM users WHERE id = ?'
  ).bind(session.userId).first<AuthUser>();

  return user ?? null;
}

export async function destroySession(token: string): Promise<void> {
  const env = await getEnv();
  const [sessionId] = token.split('.');
  if (sessionId) {
    await env.SESSION_KV.delete(`session:${sessionId}`);
  }
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export function sessionCookieOptions(token: string) {
  return {
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: SESSION_TTL,
    path: '/',
  };
}

export function clearCookieOptions() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: true,
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
}
