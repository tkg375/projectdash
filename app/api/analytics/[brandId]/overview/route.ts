import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();

  const [last30, connections, contentStats, socialAccounts] = await Promise.all([
    db.prepare(
      `SELECT metric_date, service, metrics FROM analytics_snapshots
       WHERE brand_id = ? AND metric_date >= date('now', '-30 days')
       ORDER BY metric_date DESC`
    ).bind(brandId).all<{ metric_date: string; service: string; metrics: string }>(),

    db.prepare(
      `SELECT id, service, property_id, is_active, last_sync_at FROM analytics_connections WHERE brand_id = ? AND service NOT LIKE 'twitter%'`
    ).bind(brandId).all(),

    db.prepare(
      `SELECT status, content_type, COUNT(*) as count FROM content_items WHERE brand_id = ? GROUP BY status, content_type`
    ).bind(brandId).all(),

    db.prepare(
      `SELECT platform FROM social_accounts WHERE brand_id = ? AND is_active = 1`
    ).bind(brandId).all<{ platform: string }>(),
  ]);

  const snapshots = last30.results.map(r => ({ ...r, metrics: JSON.parse(r.metrics) }));

  // GA4
  const gaData = snapshots.filter(s => s.service === 'google_analytics');
  const totalSessions = gaData.reduce((sum, s) => sum + (s.metrics.sessions ?? 0), 0);
  const totalPageViews = gaData.reduce((sum, s) => sum + (s.metrics.page_views ?? 0), 0);

  // Search Console
  const gscData = snapshots.filter(s => s.service === 'search_console');
  const totalClicks = gscData.reduce((sum, s) => sum + (s.metrics.clicks ?? 0), 0);
  const totalImpressions = gscData.reduce((sum, s) => sum + (s.metrics.impressions ?? 0), 0);
  const avgPosition = gscData.length > 0
    ? gscData.reduce((sum, s) => sum + (s.metrics.avg_position ?? 0), 0) / gscData.length
    : null;

  // LinkedIn (token verification only — detailed analytics require LinkedIn Marketing Developer Platform)
  const liMetrics = snapshots.filter(s => s.service === 'linkedin_metrics');
  const liConnected = liMetrics.length > 0;
  const liLastVerified = liMetrics.length > 0 ? liMetrics[0].metric_date : null;

  const connectedPlatforms = socialAccounts.results.map(a => a.platform);

  return NextResponse.json({
    summary: { totalSessions, totalPageViews, totalClicks, totalImpressions, avgPosition },
    linkedin: { connected: liConnected, lastVerified: liLastVerified },
    connectedPlatforms,
    snapshots,
    connections: connections.results,
    contentStats: contentStats.results,
  });
}
