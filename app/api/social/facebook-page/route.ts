import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { encrypt, generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const { pickKey, pageId, brandId: explicitBrandId } = await req.json() as { pickKey: string; pageId: string; brandId?: string };
  const env = await getEnv();
  const kv = (env as unknown as { SESSION_KV: KVNamespace }).SESSION_KV;

  const raw = await kv.get(pickKey);
  if (!raw) return NextResponse.json({ error: 'Session expired — please reconnect Facebook' }, { status: 400 });

  const { brandId: kvBrandId, expiresIn, pages } = JSON.parse(raw) as {
    brandId: string;
    expiresIn: number;
    pages: Array<{ id: string; name: string; access_token: string }>;
  };

  const page = pages.find(p => p.id === pageId);
  if (!page) return NextResponse.json({ error: 'Invalid page selected' }, { status: 400 });

  // Use explicit brandId from batch UI, or fall back to KV brandId
  const brandId = explicitBrandId ?? kvBrandId;
  if (!brandId) return NextResponse.json({ error: 'No brand specified' }, { status: 400 });

  const db = await getDb();
  const encryptedToken = await encrypt(page.access_token, (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY);

  await db.prepare(
    `INSERT INTO social_accounts (id, brand_id, platform, platform_user_id, platform_username, access_token, refresh_token, token_expires_at, is_active)
     VALUES (?, ?, 'facebook', ?, ?, ?, NULL, ?, 1)
     ON CONFLICT(brand_id, platform) DO UPDATE SET
       access_token = excluded.access_token, platform_user_id = excluded.platform_user_id,
       platform_username = excluded.platform_username, token_expires_at = excluded.token_expires_at,
       is_active = 1, last_error = NULL`
  ).bind(
    generateId(), brandId, page.id, page.name, encryptedToken,
    Math.floor(Date.now() / 1000) + expiresIn
  ).run();

  // Don't delete KV — keep session alive so user can assign remaining pages to other brands
  return NextResponse.json({ success: true, pageName: page.name, pickKey });
}
