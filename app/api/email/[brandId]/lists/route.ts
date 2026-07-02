import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateId } from '@/lib/crypto';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();
  const result = await db.prepare(
    `SELECT el.*,
       (SELECT COUNT(*) FROM email_subscribers WHERE list_id = el.id AND status = 'subscribed') as active_count
     FROM email_lists el WHERE el.brand_id = ? ORDER BY el.created_at DESC`
  ).bind(brandId).all();
  return NextResponse.json(result.results);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { name, description } = await req.json() as { name: string; description?: string };
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const db = await getDb();
  const id = generateId();
  await db.prepare(`INSERT INTO email_lists (id, brand_id, name, description) VALUES (?, ?, ?, ?)`).bind(id, brandId, name, description ?? null).run();
  return NextResponse.json({ id }, { status: 201 });
}
