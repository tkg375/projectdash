import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import AutoPublishToggle from './AutoPublishToggle';
import CadenceEditor from './CadenceEditor';
import PillarsEditor from './PillarsEditor';
import BrandVoiceEditor from './BrandVoiceEditor';

type BrandRow = {
  id: string; name: string; slug: string; website_url: string | null;
  industry: string | null; primary_color: string; brand_voice: string;
  target_audience: string; content_cadence: string; content_pillars: string;
  auto_publish: number;
};

export const dynamic = 'force-dynamic';

async function getBrandDetail(brandId: string) {
  const db = await getDb();
  const [brand, content, socialAccounts] = await Promise.all([
    db.prepare(
      `SELECT b.*, bs.content_cadence, bs.content_pillars, bs.auto_publish
       FROM brands b LEFT JOIN brand_settings bs ON bs.brand_id = b.id WHERE b.id = ?`
    ).bind(brandId).first<BrandRow>(),
    db.prepare(
      `SELECT status, content_type, COUNT(*) as count FROM content_items WHERE brand_id = ? GROUP BY status, content_type`
    ).bind(brandId).all<{ status: string; content_type: string; count: number }>(),
    db.prepare(`SELECT platform, platform_username, is_active FROM social_accounts WHERE brand_id = ?`).bind(brandId).all<{ platform: string; platform_username: string | null; is_active: number }>(),
  ]);
  return { brand, contentStats: content.results, socialAccounts: socialAccounts.results };
}

const QUICK_ACTIONS = [
  { label: 'View Content', href: (id: string) => `/content?brand=${id}`, gradient: 'from-blue-500 to-cyan-500', icon: '✦' },
  { label: 'Email Campaigns', href: (id: string) => `/email?brand=${id}`, gradient: 'from-sky-500 to-blue-600', icon: '✉' },
  { label: 'Social Accounts', href: (_: string) => `/social`, gradient: 'from-orange-500 to-amber-500', icon: '◎' },
];

export default async function BrandDetailPage({ params }: { params: Promise<{ brandId: string }> }) {
  await requireAuth();
  const { brandId } = await params;
  const { brand, contentStats, socialAccounts } = await getBrandDetail(brandId);
  if (!brand) notFound();

  const voice = JSON.parse(brand.brand_voice as string || '{}');
  const audience = JSON.parse(brand.target_audience as string || '{}');
  const cadence = JSON.parse(brand.content_cadence as string || '{}');
  const pillars = JSON.parse(brand.content_pillars as string || '[]') as string[];

  const published = contentStats.filter(r => r.status === 'published').reduce((s, r) => s + r.count, 0);
  const drafts = contentStats.filter(r => r.status === 'draft').reduce((s, r) => s + r.count, 0);
  const scheduled = contentStats.filter(r => r.status === 'scheduled').reduce((s, r) => s + r.count, 0);

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <div className="flex items-center gap-4 mb-6 sm:mb-8">
        <div className="w-12 h-12 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-lg shadow-lg"
          style={{ backgroundColor: brand.primary_color, boxShadow: `0 4px 20px ${brand.primary_color}50` }}>
          {brand.name[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{brand.name}</h1>
          {brand.website_url && (
            <a href={brand.website_url} target="_blank" rel="noopener noreferrer"
              className="text-sm text-slate-400 hover:text-indigo-600 transition-colors">
              {brand.website_url.replace(/^https?:\/\//, '')}
            </a>
          )}
        </div>
        <a href="/brands" className="ml-auto text-sm text-slate-400 hover:text-slate-700 transition-colors">← All brands</a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: 'Published', value: published, gradient: 'from-emerald-500 to-teal-600' },
          { label: 'Scheduled', value: scheduled, gradient: 'from-blue-500 to-cyan-600' },
          { label: 'Drafts', value: drafts, gradient: 'from-amber-500 to-orange-600' },
        ].map(s => (
          <div key={s.label} className="relative bg-white border border-slate-200 rounded-2xl p-4 overflow-hidden shadow-sm">
            <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${s.gradient} opacity-80`} />
            <p className="text-xs text-slate-500 mb-1">{s.label}</p>
            <p className="text-3xl font-bold text-slate-900">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Brand Voice + Target Audience editor — spans full width */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <BrandVoiceEditor
            brandId={brand.id}
            initialVoice={{ tone: voice.tone || '', personality: voice.personality || '', avoid: voice.avoid || [] }}
            initialAudience={{ who: audience.who || '', description: audience.description || '', goals: audience.goals || [], pain_points: audience.pain_points || [] }}
          />
        </div>

        {/* Cadence */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <CadenceEditor
            brandId={brand.id}
            initial={{
              blog_per_week: cadence.blog_per_week ?? 2,
              social_per_day: cadence.social_per_day ?? 2,
              social_per_week: cadence.social_per_week ?? 0,
              email_per_month: cadence.email_per_month ?? 2,
            }}
          />
        </div>

        {/* Content Pillars + Auto-publish */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Settings</h2>
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs text-slate-500">Auto-publish</span>
            <AutoPublishToggle brandId={brand.id} initialValue={!!brand.auto_publish} />
          </div>
          <div className="border-t border-slate-100 pt-4">
            <PillarsEditor brandId={brand.id} initial={pillars} />
          </div>
        </div>

        {/* Social Accounts */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Social Accounts</h2>
          {socialAccounts.length === 0 ? (
            <p className="text-slate-500 text-sm">No accounts connected. <a href="/social" className="text-indigo-600 hover:text-indigo-500">Connect →</a></p>
          ) : (
            <div className="space-y-2">
              {socialAccounts.map(a => (
                <div key={a.platform} className="flex items-center justify-between py-1">
                  <span className="text-sm text-slate-700 capitalize">{a.platform}</span>
                  <div className="flex items-center gap-2">
                    {a.platform_username && <span className="text-xs text-slate-400">@{a.platform_username}</span>}
                    <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_active ? 'text-emerald-600 bg-emerald-50 border border-emerald-200' : 'text-slate-500 bg-slate-100'}`}>
                      {a.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 gap-2">
            {QUICK_ACTIONS.map(action => (
              <a key={action.label} href={action.href(brandId)}
                className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white transition-all group shadow-sm">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm bg-gradient-to-br ${action.gradient} shrink-0`}>
                  {action.icon}
                </div>
                <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors font-medium">{action.label}</span>
                <span className="ml-auto text-slate-400 group-hover:text-slate-600 transition-colors text-xs">→</span>
              </a>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

