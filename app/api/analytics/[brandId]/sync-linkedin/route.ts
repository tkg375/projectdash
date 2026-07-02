import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { decrypt, generateId } from '@/lib/crypto';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();
  const env = await getEnv() as unknown as Record<string, unknown>;
  const encKey = env.ENCRYPTION_KEY as string;

  const account = await db.prepare(
    `SELECT id, platform_user_id, platform_username, access_token FROM social_accounts
     WHERE brand_id = ? AND platform = 'linkedin' AND is_active = 1`
  ).bind(brandId).first<{ id: string; platform_user_id: string; platform_username: string | null; access_token: string }>();

  if (!account) return NextResponse.json({ error: 'No LinkedIn account connected for this brand' }, { status: 400 });

  const token = await decrypt(account.access_token, encKey);

  // Verify token is still valid
  const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!meRes.ok) {
    const status = meRes.status;
    if (status === 401) {
      await db.prepare(`UPDATE social_accounts SET is_active = 0, last_error = 'Token expired — please reconnect' WHERE id = ?`)
        .bind(account.id).run();
      return NextResponse.json({ error: 'LinkedIn token expired — please reconnect the account' }, { status: 401 });
    }
    return NextResponse.json({ error: `LinkedIn API error: ${status}` }, { status: 400 });
  }

  const me = await meRes.json() as { sub: string; name?: string; picture?: string };

  // Store a verification snapshot (no engagement data available without Marketing Developer Platform)
  const today = new Date().toISOString().slice(0, 10);
  await db.prepare(
    `INSERT INTO analytics_snapshots (id, brand_id, service, metric_date, metrics)
     VALUES (?, ?, 'linkedin_metrics', ?, ?)
     ON CONFLICT(brand_id, service, metric_date) DO UPDATE SET metrics = excluded.metrics`
  ).bind(generateId(), brandId, today, JSON.stringify({
    verified: 1,
    name: me.name ?? account.platform_username ?? '',
  })).run();

  // Upsert analytics_connections record
  await db.prepare(
    `INSERT INTO analytics_connections (id, brand_id, service, credentials, property_id, is_active, last_sync_at)
     VALUES (?, ?, 'linkedin_metrics', '{}', ?, 1, unixepoch())
     ON CONFLICT(brand_id, service) DO UPDATE SET last_sync_at = unixepoch(), is_active = 1`
  ).bind(generateId(), brandId, me.sub || account.platform_user_id).run();

  return NextResponse.json({ ok: true, name: me.name ?? '' });
}
