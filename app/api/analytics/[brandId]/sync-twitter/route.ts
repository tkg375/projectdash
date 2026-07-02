import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { decrypt, encrypt, generateId } from '@/lib/crypto';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function refreshTwitterToken(
  env: Record<string, unknown>,
  account: { id: string; refresh_token: string },
  db: Awaited<ReturnType<typeof getDb>>,
  encKey: string,
): Promise<string | null> {
  const refreshToken = await decrypt(account.refresh_token, encKey);
  const res = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${env.TWITTER_CLIENT_ID}:${env.TWITTER_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
  const newToken = await encrypt(data.access_token, encKey);
  const newRefresh = data.refresh_token ? await encrypt(data.refresh_token, encKey) : account.refresh_token;
  const expiresAt = Math.floor(Date.now() / 1000) + (data.expires_in ?? 7200);
  await db.prepare(`UPDATE social_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ? WHERE id = ?`)
    .bind(newToken, newRefresh, expiresAt, account.id).run();
  return data.access_token;
}

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
    `SELECT id, platform_user_id, access_token, refresh_token FROM social_accounts
     WHERE brand_id = ? AND platform = 'twitter' AND is_active = 1`
  ).bind(brandId).first<{ id: string; platform_user_id: string; access_token: string; refresh_token: string | null }>();

  if (!account) return NextResponse.json({ error: 'No Twitter account connected for this brand' }, { status: 400 });

  let token = await decrypt(account.access_token, encKey);

  // Fetch user public metrics
  let meRes = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics', {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (meRes.status === 401 && account.refresh_token) {
    const refreshed = await refreshTwitterToken(env, account as { id: string; refresh_token: string }, db, encKey);
    if (refreshed) {
      token = refreshed;
      meRes = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  }

  if (!meRes.ok) {
    const errText = await meRes.text();
    return NextResponse.json({ error: `Twitter API error: ${meRes.status} ${errText}` }, { status: 400 });
  }

  const meData = await meRes.json() as { data: { id: string; public_metrics: Record<string, number> } };
  const publicMetrics = meData.data?.public_metrics ?? {};
  const userId = meData.data?.id || account.platform_user_id;

  // Fetch recent tweets with engagement metrics (last 28 days)
  const startTime = new Date(Date.now() - 28 * 86400 * 1000).toISOString();
  const tweetsRes = await fetch(
    `https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=public_metrics,created_at&start_time=${startTime}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const byDate: Record<string, { likes: number; retweets: number; replies: number; impressions: number; tweet_count: number }> = {};

  if (tweetsRes.ok) {
    const tweetsData = await tweetsRes.json() as {
      data?: Array<{ created_at: string; public_metrics: Record<string, number> }>;
    };
    for (const tweet of tweetsData.data ?? []) {
      const date = tweet.created_at.slice(0, 10);
      if (!byDate[date]) byDate[date] = { likes: 0, retweets: 0, replies: 0, impressions: 0, tweet_count: 0 };
      byDate[date].likes += tweet.public_metrics?.like_count ?? 0;
      byDate[date].retweets += tweet.public_metrics?.retweet_count ?? 0;
      byDate[date].replies += tweet.public_metrics?.reply_count ?? 0;
      byDate[date].impressions += tweet.public_metrics?.impression_count ?? 0;
      byDate[date].tweet_count += 1;
    }
  }

  // Store today's profile snapshot
  const today = new Date().toISOString().slice(0, 10);
  await db.prepare(
    `INSERT INTO analytics_snapshots (id, brand_id, service, metric_date, metrics)
     VALUES (?, ?, 'twitter_metrics', ?, ?)
     ON CONFLICT(brand_id, service, metric_date) DO UPDATE SET metrics = excluded.metrics`
  ).bind(generateId(), brandId, today, JSON.stringify({
    followers_count: publicMetrics.followers_count ?? 0,
    following_count: publicMetrics.following_count ?? 0,
    tweet_count: publicMetrics.tweet_count ?? 0,
    listed_count: publicMetrics.listed_count ?? 0,
  })).run();

  // Store per-day tweet engagement
  let daysSaved = 0;
  for (const [date, metrics] of Object.entries(byDate)) {
    await db.prepare(
      `INSERT INTO analytics_snapshots (id, brand_id, service, metric_date, metrics)
       VALUES (?, ?, 'twitter_engagement', ?, ?)
       ON CONFLICT(brand_id, service, metric_date) DO UPDATE SET metrics = excluded.metrics`
    ).bind(generateId(), brandId, date, JSON.stringify(metrics)).run();
    daysSaved++;
  }

  // Upsert analytics_connections record
  await db.prepare(
    `INSERT INTO analytics_connections (id, brand_id, service, credentials, property_id, is_active, last_sync_at)
     VALUES (?, ?, 'twitter_metrics', '{}', ?, 1, unixepoch())
     ON CONFLICT(brand_id, service) DO UPDATE SET last_sync_at = unixepoch(), is_active = 1`
  ).bind(generateId(), brandId, userId).run();

  return NextResponse.json({ ok: true, followers: publicMetrics.followers_count ?? 0, daysWithTweets: daysSaved });
}
