import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getStats() {
  const db = await getDb();
  const weekAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const [brands, content, thisWeek, failed] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as count FROM brands WHERE is_active = 1`).first<{ count: number }>(),
    db.prepare(`SELECT status, COUNT(*) as count FROM content_items GROUP BY status`).all<{ status: string; count: number }>(),
    db.prepare(`SELECT COUNT(*) as count FROM content_items WHERE created_at >= ?`).bind(weekAgo).first<{ count: number }>(),
    db.prepare(`SELECT COUNT(*) as count FROM content_items WHERE status = 'failed'`).first<{ count: number }>(),
  ]);

  const contentMap = Object.fromEntries(content.results.map((r: { status: string; count: number }) => [r.status, r.count]));

  return {
    activeBrands: brands?.count ?? 0,
    contentPublished: contentMap['published'] ?? 0,
    contentScheduled: contentMap['scheduled'] ?? 0,
    contentDraft: contentMap['draft'] ?? 0,
    generatedThisWeek: thisWeek?.count ?? 0,
    contentFailed: failed?.count ?? 0,
  };
}

type BrandRow = { id: string; name: string; slug: string; website_url: string; primary_color: string; content_count: number };

async function getRecentBrands(): Promise<BrandRow[]> {
  const db = await getDb();
  const result = await db.prepare(
    `SELECT b.id, b.name, b.slug, b.website_url, b.primary_color,
            COUNT(c.id) as content_count
     FROM brands b
     LEFT JOIN content_items c ON c.brand_id = b.id
     WHERE b.is_active = 1
     GROUP BY b.id
     ORDER BY b.created_at DESC
     LIMIT 6`
  ).all<BrandRow>();
  return result.results;
}

export default async function OverviewPage() {
  const [stats, brands] = await Promise.all([getStats(), getRecentBrands()]);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
          Good to see you{' '}
          <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
            back
          </span>{' '}
          👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">Here&apos;s what&apos;s happening across all your brands.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Active Brands"
          value={stats.activeBrands}
          gradient="from-violet-600 to-indigo-600"
          glow="shadow-violet-500/20"
          icon="🏢"
        />
        <StatCard
          label="Published"
          value={stats.contentPublished}
          gradient="from-emerald-500 to-teal-600"
          glow="shadow-emerald-500/20"
          icon="✅"
        />
        <StatCard
          label="Scheduled"
          value={stats.contentScheduled}
          gradient="from-blue-500 to-cyan-600"
          glow="shadow-blue-500/20"
          icon="🗓️"
        />
        <StatCard
          label="Drafts"
          value={stats.contentDraft}
          gradient="from-amber-500 to-orange-600"
          glow="shadow-amber-500/20"
          icon="📝"
        />
        <StatCard
          label="Generated This Week"
          value={stats.generatedThisWeek}
          gradient="from-purple-500 to-pink-600"
          glow="shadow-purple-500/20"
          icon="⚡"
        />
        <StatCard
          label="Failed"
          value={stats.contentFailed}
          gradient={stats.contentFailed > 0 ? 'from-red-500 to-rose-600' : 'from-slate-400 to-slate-500'}
          glow={stats.contentFailed > 0 ? 'shadow-red-500/20' : 'shadow-slate-300/20'}
          icon={stats.contentFailed > 0 ? '🚨' : '✓'}
        />
      </div>

      {/* Brands */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-slate-900">Your Brands</h2>
          <a href="/brands" className="text-xs font-medium text-indigo-600 hover:text-indigo-500 transition-colors">
            View all →
          </a>
        </div>
        {brands.length === 0 ? (
          <div className="border border-dashed border-slate-300 rounded-2xl p-10 text-center">
            <p className="text-4xl mb-3">🚀</p>
            <p className="text-slate-500 text-sm font-medium mb-4">No brands yet — let&apos;s get started</p>
            <a href="/brands" className="inline-block bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm px-5 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-indigo-500/25">
              Add your first brand
            </a>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {brands.map((b) => (
              <a
                key={b.id}
                href={`/brands/${b.id}`}
                className="group relative border border-slate-200 hover:border-slate-300 rounded-2xl p-5 transition-all duration-200 overflow-hidden block bg-white shadow-sm hover:shadow-md"
              >
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at top left, ${b.primary_color}10, transparent 60%)` }}
                />
                <div className="relative flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 shadow-lg flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: b.primary_color, boxShadow: `0 4px 14px ${b.primary_color}40` }}
                  >
                    {b.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">{b.name}</p>
                    {b.website_url && (
                      <p className="text-xs text-slate-500 truncate">{b.website_url.replace(/^https?:\/\//, '')}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-slate-500">
                    <span className="text-slate-900 font-semibold">{b.content_count}</span> content items
                  </p>
                  <span className="text-xs text-slate-400 group-hover:text-slate-600 transition-colors">View →</span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, gradient, glow, icon }: {
  label: string;
  value: number;
  gradient: string;
  glow: string;
  icon: string;
}) {
  return (
    <div className={`relative rounded-2xl p-5 overflow-hidden bg-gradient-to-br ${gradient} shadow-xl ${glow}`}>
      <div className="absolute inset-0 opacity-10" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'1\'/%3E%3C/svg%3E")',
      }} />
      <div className="relative">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-medium text-white/70">{label}</p>
          <span className="text-lg">{icon}</span>
        </div>
        <p className="text-4xl font-bold text-white tracking-tight">{value.toLocaleString()}</p>
      </div>
    </div>
  );
}
