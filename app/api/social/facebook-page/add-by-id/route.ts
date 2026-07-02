import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { encrypt, generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as { pickKey: string; pageId: string; brandId: string };
  const { pickKey, pageId, brandId } = body;

  if (!pickKey || !pageId || !brandId) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const env = await getEnv();
  const kv = (env as unknown as { SESSION_KV: KVNamespace }).SESSION_KV;
  const raw = await kv.get(pickKey);
  if (!raw) return NextResponse.json({ error: 'Session expired — reconnect Facebook' }, { status: 404 });

  const session = JSON.parse(raw) as {
    brandId: string;
    expiresIn: number;
    userToken?: string;
    pages: Array<{ id: string; name: string; access_token: string }>;
  };

  // First check if the page token is already in the KV pages list
  const existing = session.pages.find(p => p.id === pageId);
  let pageToken: string;
  let pageName: string;

  if (existing) {
    pageToken = existing.access_token;
    pageName = existing.name;
  } else {
    // Use the stored user token to fetch the page token from Graph API
    const userToken = session.userToken;
    if (!userToken) {
      return NextResponse.json({ error: 'No user token stored — reconnect Facebook' }, { status: 400 });
    }

    const res = await fetch(
      `https://graph.facebook.com/v22.0/${pageId}?fields=id,name,access_token&access_token=${userToken}`
    );
    const data = await res.json() as { id?: string; name?: string; access_token?: string; error?: { message: string } };

    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error?.message ?? 'Could not fetch page' }, { status: 400 });
    }
    if (!data.access_token) {
      return NextResponse.json({ error: 'Page not accessible — make sure you are an admin of this page' }, { status: 400 });
    }

    pageToken = data.access_token;
    pageName = data.name ?? pageId;
  }

  const encKey = (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY;
  const encryptedToken = await encrypt(pageToken, encKey);

  const db = await getDb();
  const tokenExpiresAt = Math.floor(Date.now() / 1000) + session.expiresIn;

  await db.prepare(
    `INSERT INTO social_accounts (id, brand_id, platform, platform_user_id, platform_username, access_token, refresh_token, token_expires_at, is_active)
     VALUES (?, ?, 'facebook', ?, ?, ?, NULL, ?, 1)
     ON CONFLICT(brand_id, platform) DO UPDATE SET
       access_token = excluded.access_token, refresh_token = NULL,
       token_expires_at = excluded.token_expires_at, platform_username = excluded.platform_username,
       platform_user_id = excluded.platform_user_id,
       is_active = 1, last_error = NULL`
  ).bind(generateId(), brandId, pageId, pageName, encryptedToken, tokenExpiresAt).run();

  return NextResponse.json({ ok: true, pageName });
}
