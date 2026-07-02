import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
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
    `SELECT id, brand_id, platform, platform_username, platform_user_id, is_active, last_error, created_at
     FROM social_accounts WHERE brand_id = ? ORDER BY created_at ASC`
  ).bind(brandId).all();
  return NextResponse.json(result.results);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get('id');
  if (!accountId) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const db = await getDb();
  // Clear FK references first to avoid constraint errors
  await db.prepare(`UPDATE content_items SET social_account_id = NULL WHERE social_account_id = ?`).bind(accountId).run();
  await db.prepare(`DELETE FROM social_accounts WHERE id = ? AND brand_id = ?`).bind(accountId, brandId).run();
  return NextResponse.json({ success: true });
}
