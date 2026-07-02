import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { encrypt, generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const body = await req.json() as { brandId?: string; instanceUrl?: string; accessToken?: string };
  const { brandId, instanceUrl, accessToken } = body;

  if (!brandId || !instanceUrl || !accessToken) {
    return NextResponse.json({ error: 'brandId, instanceUrl, and accessToken required' }, { status: 400 });
  }

  const cleanInstance = instanceUrl.trim().replace(/\/$/, '');

  // Verify token against instance
  const verifyRes = await fetch(`${cleanInstance}/api/v1/accounts/verify_credentials`, {
    headers: { 'Authorization': `Bearer ${accessToken.trim()}` },
  });

  if (!verifyRes.ok) {
    return NextResponse.json({ error: 'Invalid Mastodon credentials — check your instance URL and access token' }, { status: 400 });
  }

  const account = await verifyRes.json() as { id: string; username: string; acct: string };

  const env = await getEnv();
  const encKey = (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY;
  // Store as "instanceUrl::accessToken"
  const encrypted = await encrypt(`${cleanInstance}::${accessToken.trim()}`, encKey);

  const db = await getDb();
  await db.prepare(
    `INSERT INTO social_accounts (id, brand_id, platform, platform_user_id, platform_username, access_token, is_active)
     VALUES (?, ?, 'mastodon', ?, ?, ?, 1)
     ON CONFLICT(brand_id, platform) DO UPDATE SET
       platform_user_id = excluded.platform_user_id,
       platform_username = excluded.platform_username,
       access_token = excluded.access_token,
       is_active = 1, last_error = NULL`
  ).bind(generateId(), brandId, account.id, account.acct, encrypted).run();

  return NextResponse.json({ ok: true, username: account.acct });
}
