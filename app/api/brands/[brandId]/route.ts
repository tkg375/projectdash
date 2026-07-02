import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function ownsBrand(userId: string, brandId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.prepare('SELECT id FROM brands WHERE id = ? AND user_id = ?').bind(brandId, userId).first();
  return !!row;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const user = await requireAuth();
  const { brandId } = await params;
  if (!await ownsBrand(user.id, brandId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = await getDb();
  const brand = await db.prepare(
    `SELECT b.*, bs.content_cadence, bs.content_pillars, bs.auto_publish
     FROM brands b
     LEFT JOIN brand_settings bs ON bs.brand_id = b.id
     WHERE b.id = ?`
  ).bind(brandId).first();
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(brand);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const user = await requireAuth();
  const { brandId } = await params;
  if (!await ownsBrand(user.id, brandId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = await getDb();
  const body = await req.json() as Record<string, unknown>;
  const allowed = ['name', 'website_url', 'industry', 'primary_color', 'timezone', 'is_active'];
  const updates = Object.entries(body)
    .filter(([k]) => allowed.includes(k))
    .map(([k, v]) => ({ k, v }));

  const hasSettingsFields = ['auto_publish', 'brand_voice', 'target_audience', 'content_cadence', 'content_pillars'].some(k => k in body);
  if (updates.length === 0 && !hasSettingsFields) return NextResponse.json({ error: 'No valid fields' }, { status: 400 });

  if (updates.length > 0) {
    const set = updates.map(({ k }) => `${k} = ?`).join(', ');
    const values = updates.map(({ v }) => v);
    await db.prepare(`UPDATE brands SET ${set}, updated_at = unixepoch() WHERE id = ?`)
      .bind(...values, brandId).run();
  }

  if (body.brand_voice) {
    await db.prepare(`UPDATE brands SET brand_voice = ?, updated_at = unixepoch() WHERE id = ?`)
      .bind(JSON.stringify(body.brand_voice), brandId).run();
  }
  if (body.target_audience) {
    await db.prepare(`UPDATE brands SET target_audience = ?, updated_at = unixepoch() WHERE id = ?`)
      .bind(JSON.stringify(body.target_audience), brandId).run();
  }
  if (body.content_cadence) {
    await db.prepare(`UPDATE brand_settings SET content_cadence = ?, updated_at = unixepoch() WHERE brand_id = ?`)
      .bind(JSON.stringify(body.content_cadence), brandId).run();
  }
  if (body.content_pillars) {
    await db.prepare(`UPDATE brand_settings SET content_pillars = ?, updated_at = unixepoch() WHERE brand_id = ?`)
      .bind(JSON.stringify(body.content_pillars), brandId).run();
  }
  if (typeof body.auto_publish === 'boolean') {
    await db.prepare(
      `INSERT INTO brand_settings (brand_id, auto_publish, updated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT (brand_id) DO UPDATE SET auto_publish = excluded.auto_publish, updated_at = unixepoch()`
    ).bind(brandId, body.auto_publish ? 1 : 0).run();
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const user = await requireAuth();
  const { brandId } = await params;
  if (!await ownsBrand(user.id, brandId)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const db = await getDb();
  await db.prepare(`DELETE FROM brands WHERE id = ?`).bind(brandId).run();
  return NextResponse.json({ success: true });
}
