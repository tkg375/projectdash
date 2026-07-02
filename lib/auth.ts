import { getDb } from '@/lib/db';
import { validateSession, getSessionToken } from '@/lib/session';
import { redirect } from 'next/navigation';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  plan: string;
}

export async function requireAuth(): Promise<AuthUser> {
  const token = await getSessionToken();
  if (!token) redirect('/login');

  const user = await validateSession(token);
  if (!user) redirect('/login');

  return user;
}

export async function hashPassword(plain: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  const hashBuf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  const computed = await hashPassword(plain);
  return computed === hash;
}

export async function getUserByEmail(email: string): Promise<(AuthUser & { password_hash: string }) | null> {
  const db = await getDb();
  return db.prepare(
    'SELECT id, email, name, plan, password_hash FROM users WHERE email = ?'
  ).bind(email.toLowerCase().trim()).first<AuthUser & { password_hash: string }>();
}

// Returns 404 NextResponse if user doesn't own the brand, null if they do
export async function assertBrandOwner(userId: string, brandId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?').bind(brandId, userId).first();
  return !!row;
}

export async function createUser(id: string, email: string, name: string, passwordHash: string): Promise<void> {
  const db = await getDb();
  await db.prepare(
    'INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)'
  ).bind(id, email.toLowerCase().trim(), name.trim(), passwordHash).run();
}
