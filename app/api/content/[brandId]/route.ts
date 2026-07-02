import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') ?? '50');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  const db = await getDb();
  let query = `SELECT * FROM content_items WHERE brand_id = ?`;
  const bindings: unknown[] = [brandId];

  if (type) { query += ` AND content_type = ?`; bindings.push(type); }
  if (status) { query += ` AND status = ?`; bindings.push(status); }
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  bindings.push(limit, offset);

  const results = await db.prepare(query).bind(...bindings).all();
  return NextResponse.json(results.results);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const body = await req.json() as { scheduled_for?: number; publish?: boolean };
  const db = await getDb();
  if (body.publish) {
    await db.prepare(
      `UPDATE content_items SET status = 'published', published_at = unixepoch(), scheduled_for = NULL, updated_at = unixepoch() WHERE id = ? AND brand_id = ?`
    ).bind(id, brandId).run();
    return NextResponse.json({ success: true });
  }
  if (!body.scheduled_for) return NextResponse.json({ error: 'Missing scheduled_for' }, { status: 400 });
  await db.prepare(
    `UPDATE content_items SET scheduled_for = ?, status = 'scheduled', updated_at = unixepoch() WHERE id = ? AND brand_id = ?`
  ).bind(body.scheduled_for, id, brandId).run();
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  const db = await getDb();
  await db.prepare(`DELETE FROM content_items WHERE id = ? AND brand_id = ?`).bind(id, brandId).run();
  return NextResponse.json({ success: true });
}
