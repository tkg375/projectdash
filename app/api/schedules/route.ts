import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

interface Schedule {
  id: string; name: string; brand_ids: string; content_type: string;
  platform: string | null; posts_per_day: number; posts_per_week: number; topic: string | null;
  auto_publish: number; start_date: string; end_date: string;
  is_active: number; created_at: number;
}

export async function GET() {
  const db = await getDb();
  const result = await db.prepare(
    `SELECT * FROM content_schedules ORDER BY created_at DESC`
  ).all<Schedule>();
  return NextResponse.json(result.results);
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    name: string; brand_ids: string[]; content_type: string;
    platform?: string; posts_per_day?: number; posts_per_week?: number; topic?: string;
    auto_publish?: boolean; start_date: string; end_date: string;
  };

  if (!body.name || !body.brand_ids?.length || !body.content_type || !body.start_date || !body.end_date) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const db = await getDb();
  const id = generateId();
  await db.prepare(
    `INSERT INTO content_schedules (id, name, brand_ids, content_type, platform, posts_per_day, posts_per_week, topic, auto_publish, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, body.name, JSON.stringify(body.brand_ids), body.content_type,
    body.platform ?? null, body.posts_per_day ?? 0, body.posts_per_week ?? 0, body.topic ?? null,
    body.auto_publish !== false ? 1 : 0, body.start_date, body.end_date
  ).run();

  return NextResponse.json({ id });
}
