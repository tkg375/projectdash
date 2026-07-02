import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateId, encrypt } from '@/lib/crypto';
import { getEnv } from '@/lib/db';
import { z } from 'zod';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const ConnectionSchema = z.object({
  service: z.enum(['google_analytics', 'search_console', 'meta_insights']),
  property_id: z.string().optional(),
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();
  const result = await db.prepare(
    `SELECT id, service, property_id, is_active, last_sync_at FROM analytics_connections WHERE brand_id = ?`
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
    const data = ConnectionSchema.parse(body);
    const env = await getEnv();
    const db = await getDb();

    const encKey = (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY;
    const creds: Record<string, string> = {};
    if (data.access_token) creds.access_token = await encrypt(data.access_token, encKey);
    if (data.refresh_token) creds.refresh_token = await encrypt(data.refresh_token, encKey);

    const id = generateId();
    await db.prepare(
      `INSERT INTO analytics_connections (id, brand_id, service, property_id, credentials)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(brand_id, service) DO UPDATE SET
         property_id = excluded.property_id, credentials = excluded.credentials, is_active = 1`
    ).bind(id, brandId, data.service, data.property_id ?? null, JSON.stringify(creds)).run();

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
