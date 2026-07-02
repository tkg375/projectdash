import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ brandId: string; listId: string }> }) {
  const { listId } = await params;
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '100');
  const offset = parseInt(searchParams.get('offset') ?? '0');
  const db = await getDb();
  const result = await db.prepare(
    `SELECT id, email, first_name, last_name, status, subscribed_at FROM email_subscribers
     WHERE list_id = ? ORDER BY subscribed_at DESC LIMIT ? OFFSET ?`
  ).bind(listId, limit, offset).all();
  return NextResponse.json(result.results);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brandId: string; listId: string }> }) {
  const { brandId, listId } = await params;
  const body = await req.json() as { email: string; first_name?: string; last_name?: string } | Array<{ email: string; first_name?: string; last_name?: string }>;
  const db = await getDb();
  const subscribers = Array.isArray(body) ? body : [body];
  let added = 0;
  for (const sub of subscribers) {
    if (!sub.email) continue;
    try {
      await db.prepare(
        `INSERT OR IGNORE INTO email_subscribers (id, list_id, brand_id, email, first_name, last_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(generateId(), listId, brandId, sub.email.toLowerCase(), sub.first_name ?? null, sub.last_name ?? null).run();
      added++;
    } catch { /* skip duplicates */ }
  }
  await db.prepare(
    `UPDATE email_lists SET subscriber_count = (SELECT COUNT(*) FROM email_subscribers WHERE list_id = ? AND status = 'subscribed') WHERE id = ?`
  ).bind(listId, listId).run();
  return NextResponse.json({ added }, { status: 201 });
}
