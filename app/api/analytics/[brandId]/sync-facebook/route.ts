import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { generateId } from '@/lib/crypto';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Metrics still available in Graph API v22.0 for standard page tokens.
// Many classic page_impressions* metrics were deprecated in 2024 for newer app types.
// We probe each one individually so a deprecated metric doesn't kill the whole request.
const CANDIDATE_METRICS = [
  'page_impressions',
  'page_impressions_unique',
  'page_engaged_users',
  'page_daily_follows',
  'page_daily_follows_unique',
];

export async function POST(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();
  const env = await getEnv();
  const encKey = (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY;

  const fbAccount = await db.prepare(
    `SELECT platform_user_id, access_token FROM social_accounts WHERE brand_id = ? AND platform = 'facebook' AND is_active = 1`
  ).bind(brandId).first<{ platform_user_id: string; access_token: string }>();

  if (!fbAccount) return NextResponse.json({ error: 'No Facebook account connected for this brand' }, { status: 400 });

  const pageToken = await decrypt(fbAccount.access_token, encKey);
  const pageId = fbAccount.platform_user_id;

  const since = Math.floor(Date.now() / 1000) - 28 * 86400;
  const until = Math.floor(Date.now() / 1000);

  // Probe metrics one at a time to skip any that are deprecated for this app/page type
  const workingMetrics: string[] = [];
  for (const metric of CANDIDATE_METRICS) {
    const probe = await fetch(
      `https://graph.facebook.com/v22.0/${pageId}/insights?metric=${metric}&period=day&since=${since}&until=${since + 86400}&access_token=${pageToken}`
    );
    const probeData = await probe.json() as { error?: { code: number } };
    if (!probeData.error) workingMetrics.push(metric);
  }

  // Record that we attempted a sync even if no metrics are available
  await db.prepare(
    `INSERT INTO analytics_connections (id, brand_id, service, credentials, property_id, is_active, last_sync_at)
     VALUES (?, ?, 'facebook_insights', '{}', ?, 1, unixepoch())
     ON CONFLICT(brand_id, service) DO UPDATE SET last_sync_at = unixepoch(), is_active = 1`
  ).bind(generateId(), brandId, pageId).run();

  if (workingMetrics.length === 0) {
    return NextResponse.json({ ok: true, daysSaved: 0, warning: 'No Page Insights metrics are available for this page. Facebook has deprecated most classic insights metrics for newer app and page types.' });
  }

  const insightsRes = await fetch(
    `https://graph.facebook.com/v22.0/${pageId}/insights?metric=${workingMetrics.join(',')}&period=day&since=${since}&until=${until}&access_token=${pageToken}`
  );
  const insightsData = await insightsRes.json() as {
    data?: Array<{ name: string; period: string; values: Array<{ value: number; end_time: string }> }>;
    error?: { message: string };
  };

  if (insightsData.error) {
    // Still don't surface this as an error — just record the sync attempt
    return NextResponse.json({ ok: true, daysSaved: 0, warning: insightsData.error.message });
  }

  const byDate: Record<string, Record<string, number>> = {};
  for (const metric of insightsData.data ?? []) {
    for (const point of metric.values) {
      const date = point.end_time.slice(0, 10);
      if (!byDate[date]) byDate[date] = {};
      byDate[date][metric.name] = typeof point.value === 'number' ? point.value : 0;
    }
  }

  let saved = 0;
  for (const [date, metrics] of Object.entries(byDate)) {
    await db.prepare(
      `INSERT INTO analytics_snapshots (id, brand_id, service, metric_date, metrics)
       VALUES (?, ?, 'facebook_insights', ?, ?)
       ON CONFLICT(brand_id, service, metric_date) DO UPDATE SET metrics = excluded.metrics`
    ).bind(generateId(), brandId, date, JSON.stringify(metrics)).run();
    saved++;
  }

  return NextResponse.json({ ok: true, daysSaved: saved, metricsUsed: workingMetrics });
}
