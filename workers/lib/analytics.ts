import type { WorkerEnv } from './types';
import { upsertAnalyticsSnapshot } from './db';
import { decrypt } from './crypto';
import { generateId } from './crypto';

function yesterday(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

// ── Google OAuth Token Refresh ────────────────────────────────────────────────

async function refreshGoogleToken(env: WorkerEnv, refreshToken: string, connId: string): Promise<string | null> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
    }),
  });

  if (!res.ok) return null;
  const data = await res.json() as { access_token: string; expires_in: number };
  const { encrypt } = await import('./crypto');
  const newToken = await encrypt(data.access_token, env.ENCRYPTION_KEY);
  await env.DB.prepare(
    `UPDATE analytics_connections SET credentials = json_set(credentials, '$.access_token', ?), last_sync_at = unixepoch() WHERE id = ?`
  ).bind(newToken, connId).run();
  return data.access_token;
}

// ── Google Analytics 4 ────────────────────────────────────────────────────────

export async function syncGoogleAnalytics(env: WorkerEnv, brandId: string, connId: string, propertyId: string, credJson: string): Promise<void> {
  const creds = JSON.parse(credJson);
  let accessToken = creds.access_token ? await decrypt(creds.access_token, env.ENCRYPTION_KEY).catch(() => creds.access_token) : '';

  if (!accessToken && creds.refresh_token) {
    const rt = await decrypt(creds.refresh_token, env.ENCRYPTION_KEY).catch(() => creds.refresh_token);
    accessToken = await refreshGoogleToken(env, rt, connId) ?? '';
  }
  if (!accessToken) return;

  const date = yesterday();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({
      dateRanges: [{ startDate: date, endDate: date }],
      metrics: [
        { name: 'sessions' }, { name: 'activeUsers' }, { name: 'newUsers' },
        { name: 'bounceRate' }, { name: 'averageSessionDuration' }, { name: 'screenPageViews' },
      ],
    }),
  });

  if (!res.ok) {
    if (res.status === 401 && creds.refresh_token) {
      const rt = await decrypt(creds.refresh_token, env.ENCRYPTION_KEY).catch(() => creds.refresh_token);
      accessToken = await refreshGoogleToken(env, rt, connId) ?? '';
      if (!accessToken) return;
      // Retry once
      return syncGoogleAnalytics(env, brandId, connId, propertyId, JSON.stringify({ ...creds, access_token: accessToken }));
    }
    return;
  }

  const data = await res.json() as { rows?: Array<{ metricValues: Array<{ value: string }> }> };
  const row = data.rows?.[0]?.metricValues;
  if (!row) return;

  await upsertAnalyticsSnapshot(env, {
    brandId,
    service: 'google_analytics',
    metricDate: date,
    metrics: {
      sessions: parseInt(row[0]?.value ?? '0'),
      active_users: parseInt(row[1]?.value ?? '0'),
      new_users: parseInt(row[2]?.value ?? '0'),
      bounce_rate: parseFloat(row[3]?.value ?? '0'),
      avg_session_duration: parseFloat(row[4]?.value ?? '0'),
      page_views: parseInt(row[5]?.value ?? '0'),
    },
  });

  await env.DB.prepare(`UPDATE analytics_connections SET last_sync_at = unixepoch() WHERE id = ?`).bind(connId).run();
}

// ── Google Search Console ─────────────────────────────────────────────────────

export async function syncSearchConsole(env: WorkerEnv, brandId: string, connId: string, siteUrl: string, credJson: string): Promise<void> {
  const creds = JSON.parse(credJson);
  let accessToken = creds.access_token ? await decrypt(creds.access_token, env.ENCRYPTION_KEY).catch(() => creds.access_token) : '';

  if (!accessToken && creds.refresh_token) {
    const rt = await decrypt(creds.refresh_token, env.ENCRYPTION_KEY).catch(() => creds.refresh_token);
    accessToken = await refreshGoogleToken(env, rt, connId) ?? '';
  }
  if (!accessToken) return;

  const date = yesterday();
  const startDate = new Date(date);
  startDate.setDate(startDate.getDate() - 28);
  const startStr = startDate.toISOString().slice(0, 10);

  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
    body: JSON.stringify({
      startDate: startStr,
      endDate: date,
      dimensions: ['date'],
      rowLimit: 28,
    }),
  });

  if (!res.ok) return;
  const data = await res.json() as { rows?: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> };

  for (const row of data.rows ?? []) {
    await upsertAnalyticsSnapshot(env, {
      brandId,
      service: 'search_console',
      metricDate: row.keys[0],
      metrics: {
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        avg_position: row.position,
      },
    });
  }

  await env.DB.prepare(`UPDATE analytics_connections SET last_sync_at = unixepoch() WHERE id = ?`).bind(connId).run();
}

// ── Meta (Facebook) Insights ──────────────────────────────────────────────────

export async function syncMetaInsights(env: WorkerEnv, brandId: string, connId: string, pageId: string, credJson: string): Promise<void> {
  const creds = JSON.parse(credJson);
  const token = creds.access_token ? await decrypt(creds.access_token, env.ENCRYPTION_KEY).catch(() => creds.access_token) : '';
  if (!token) return;

  const date = yesterday();
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${pageId}/insights?metric=page_impressions,page_impressions_unique,page_engaged_users&period=day&since=${date}&until=${date}&access_token=${token}`,
  );

  if (!res.ok) return;
  const data = await res.json() as { data: Array<{ name: string; values: Array<{ value: number }> }> };
  const metrics: Record<string, number> = {};
  for (const metric of data.data ?? []) {
    metrics[metric.name] = metric.values?.[0]?.value ?? 0;
  }

  await upsertAnalyticsSnapshot(env, { brandId, service: 'meta_insights', metricDate: date, metrics });
  await env.DB.prepare(`UPDATE analytics_connections SET last_sync_at = unixepoch() WHERE id = ?`).bind(connId).run();
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export async function queueAnalyticsSync(env: WorkerEnv, brandId: string): Promise<void> {
  const conns = await env.DB.prepare(
    `SELECT * FROM analytics_connections WHERE brand_id = ? AND is_active = 1`
  ).bind(brandId).all<{ id: string; service: string; property_id: string | null; credentials: string }>();

  for (const conn of conns.results) {
    await env.ANALYTICS_SYNC_QUEUE.send({
      jobId: generateId(),
      jobType: 'sync_analytics',
      brandId,
      payload: { connId: conn.id, service: conn.service, propertyId: conn.property_id },
    });
  }
}

export async function processAnalyticsSync(env: WorkerEnv, brandId: string, connId: string, service: string, propertyId?: string): Promise<void> {
  const conn = await env.DB.prepare(`SELECT * FROM analytics_connections WHERE id = ?`).bind(connId).first<{ credentials: string; property_id: string | null }>();
  if (!conn) return;

  const pid = propertyId ?? conn.property_id ?? '';

  switch (service) {
    case 'google_analytics': return syncGoogleAnalytics(env, brandId, connId, pid, conn.credentials);
    case 'search_console': return syncSearchConsole(env, brandId, connId, pid, conn.credentials);
    case 'meta_insights': return syncMetaInsights(env, brandId, connId, pid, conn.credentials);
  }
}
