import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, hashPassword, verifyPassword, getUserByEmail } from '@/lib/auth';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await requireAuth();
  return NextResponse.json({ email: user.email, name: user.name });
}

export async function PATCH(req: NextRequest) {
  const user = await requireAuth();
  const body = await req.json() as { email?: string; name?: string; current_password?: string; new_password?: string };
  const db = await getDb();

  // If changing password, verify current password first
  if (body.new_password) {
    if (!body.current_password) {
      return NextResponse.json({ error: 'Current password required' }, { status: 400 });
    }
    const row = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first<{ password_hash: string }>();
    if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const valid = await verifyPassword(body.current_password, row.password_hash);
    if (!valid) return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    const newHash = await hashPassword(body.new_password);
    await db.prepare('UPDATE users SET password_hash = ?, updated_at = unixepoch() WHERE id = ?').bind(newHash, user.id).run();
  }

  if (body.email) {
    const existing = await getUserByEmail(body.email);
    if (existing && existing.id !== user.id) {
      return NextResponse.json({ error: 'Email already in use' }, { status: 400 });
    }
    await db.prepare('UPDATE users SET email = ?, updated_at = unixepoch() WHERE id = ?').bind(body.email.toLowerCase().trim(), user.id).run();
  }

  if (body.name) {
    await db.prepare('UPDATE users SET name = ?, updated_at = unixepoch() WHERE id = ?').bind(body.name.trim(), user.id).run();
  }

  return NextResponse.json({ success: true });
}
