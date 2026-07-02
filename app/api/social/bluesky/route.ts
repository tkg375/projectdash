import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { encrypt, generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as { brandId?: string; handle?: string; appPassword?: string };
  const { brandId, handle, appPassword } = body;

  if (!brandId || !handle || !appPassword) {
    return NextResponse.json({ error: 'brandId, handle, and appPassword required' }, { status: 400 });
  }

  const cleanHandle = handle.trim().replace(/^@/, '');

  // Verify credentials against Bluesky before saving
  const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: cleanHandle, password: appPassword.trim() }),
  });

  if (!sessionRes.ok) {
    const err = await sessionRes.json() as { message?: string };
    return NextResponse.json({ error: err.message ?? 'Invalid Bluesky credentials' }, { status: 400 });
  }

  const session = await sessionRes.json() as { did: string; handle: string };

  const env = await getEnv();
  const encKey = (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY;
  // Store as "handle::appPassword" so we can re-authenticate on each post
  const encrypted = await encrypt(`${cleanHandle}::${appPassword.trim()}`, encKey);

  const db = await getDb();
  await db.prepare(
    `INSERT INTO social_accounts (id, brand_id, platform, platform_user_id, platform_username, access_token, is_active)
     VALUES (?, ?, 'bluesky', ?, ?, ?, 1)
     ON CONFLICT(brand_id, platform) DO UPDATE SET
       platform_user_id = excluded.platform_user_id,
       platform_username = excluded.platform_username,
       access_token = excluded.access_token,
       is_active = 1, last_error = NULL`
  ).bind(generateId(), brandId, session.did, session.handle, encrypted).run();

  return NextResponse.json({ ok: true, handle: session.handle });
}
