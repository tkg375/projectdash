import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateId } from '@/lib/crypto';
import { z } from 'zod';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const AddKeywordSchema = z.object({
  keyword: z.string().min(1).max(200),
  target_rank: z.number().default(10),
  intent: z.enum(['informational', 'transactional', 'navigational']).default('informational'),
  is_auto_target: z.boolean().default(true),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();
  const result = await db.prepare(
    `SELECT sk.*,
       (SELECT rank FROM keyword_rankings WHERE keyword_id = sk.id ORDER BY recorded_at DESC LIMIT 1) as latest_rank
     FROM seo_keywords sk WHERE sk.brand_id = ? ORDER BY sk.created_at DESC`
  ).bind(brandId).all();
  return NextResponse.json(result.results);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await req.json() as unknown;
    const data = AddKeywordSchema.parse(body);
    const db = await getDb();
    await db.prepare(
      `INSERT OR IGNORE INTO seo_keywords (id, brand_id, keyword, target_rank, intent, is_auto_target)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(generateId(), brandId, data.keyword, data.target_rank, data.intent, data.is_auto_target ? 1 : 0).run();
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = await getDb();
  await db.prepare(`DELETE FROM seo_keywords WHERE id = ? AND brand_id = ?`).bind(id, brandId).run();
  return NextResponse.json({ success: true });
}
