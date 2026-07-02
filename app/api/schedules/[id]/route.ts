import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json() as {
    is_active?: boolean;
    name?: string;
    brand_ids?: string[];
    content_type?: string;
    platform?: string;
    posts_per_day?: number;
    posts_per_week?: number;
    topic?: string;
    auto_publish?: boolean;
    start_date?: string;
    end_date?: string;
  };
  const db = await getDb();

  if (Object.keys(body).length === 1 && 'is_active' in body) {
    // Toggle only
    await db.prepare(`UPDATE content_schedules SET is_active = ? WHERE id = ?`)
      .bind(body.is_active ? 1 : 0, id).run();
  } else {
    // Full update
    await db.prepare(
      `UPDATE content_schedules SET
        name = ?, brand_ids = ?, content_type = ?, platform = ?, posts_per_day = ?,
        posts_per_week = ?, topic = ?, auto_publish = ?, start_date = ?, end_date = ?
       WHERE id = ?`
    ).bind(
      body.name, JSON.stringify(body.brand_ids ?? []),
      body.content_type, body.platform ?? null, body.posts_per_day ?? 0,
      body.posts_per_week ?? 0, body.topic ?? null, body.auto_publish ? 1 : 0,
      body.start_date, body.end_date, id
    ).run();
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = await getDb();
  await db.prepare(`DELETE FROM content_schedules WHERE id = ?`).bind(id).run();
  return NextResponse.json({ ok: true });
}
