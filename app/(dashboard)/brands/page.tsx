'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Brand {
  id: string;
  name: string;
  slug: string;
  website_url: string;
  industry: string;
  primary_color: string;
  is_active: number;
  content_cadence: string;
  auto_publish: number;
}

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', slug: '', website_url: '', industry: '',
    primary_color: '#6366f1', timezone: 'America/New_York',
    brand_voice: { tone: 'professional', personality: '', avoid: [] as string[], examples: [] as string[] },
    target_audience: { age_range: '', interests: [] as string[], locations: [] as string[] },
    content_cadence: { blog_per_week: 2, social_per_day: 2, email_per_month: 2 },
    content_pillars: [] as string[],
  });

  useEffect(() => { fetchBrands(); }, []);

  async function fetchBrands() {
    const res = await fetch('/api/brands');
    setBrands(await res.json());
    setLoading(false);
  }

  function handleNameChange(name: string) {
    setForm(f => ({
      ...f,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowForm(false);
      fetchBrands();
    }
    setSaving(false);
  }

  if (loading) return <div className="p-8 text-slate-400 text-sm">Loading...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6 sm:mb-8 gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Brands</h1>
          <p className="text-slate-500 text-sm mt-1">Manage your companies and their marketing settings</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="shrink-0 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm px-4 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-indigo-500/25"
        >
          Add brand
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">New Brand</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <Field label="Brand Name">
                <input value={form.name} onChange={e => handleNameChange(e.target.value)}
                  className={inputCls} placeholder="The Gilded Bar" required />
              </Field>
              <Field label="Slug">
                <input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))}
                  className={inputCls} placeholder="the-gilded-bar" required pattern="[a-z0-9-]+" />
              </Field>
              <Field label="Website URL">
                <input value={form.website_url} onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
                  className={inputCls} placeholder="https://example.com" type="url" />
              </Field>
              <Field label="Industry">
                <input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))}
                  className={inputCls} placeholder="Hospitality, SaaS, E-commerce..." />
              </Field>
              <Field label="Brand Color">
                <div className="flex gap-2 items-center">
                  <input type="color" value={form.primary_color}
                    onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))}
                    className="h-9 w-12 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer" />
                  <span className="text-slate-500 text-sm">{form.primary_color}</span>
                </div>
              </Field>
              <Field label="Brand Tone">
                <select value={form.brand_voice.tone}
                  onChange={e => setForm(f => ({ ...f, brand_voice: { ...f.brand_voice, tone: e.target.value } }))}
                  className={inputCls}>
                  <option value="professional">Professional</option>
                  <option value="casual">Casual & Friendly</option>
                  <option value="luxury">Luxury & Elegant</option>
                  <option value="playful">Playful & Fun</option>
                  <option value="authoritative">Authoritative</option>
                  <option value="conversational">Conversational</option>
                </select>
              </Field>
              <Field label="Brand Personality">
                <textarea value={form.brand_voice.personality}
                  onChange={e => setForm(f => ({ ...f, brand_voice: { ...f.brand_voice, personality: e.target.value } }))}
                  className={`${inputCls} h-20 resize-none`}
                  placeholder="Describe how this brand sounds — e.g. 'Like a trusted friend who happens to be an expert'" />
              </Field>
              <Field label="Content: Posts/Day (Social)">
                <input type="number" min={0} max={10} value={form.content_cadence.social_per_day}
                  onChange={e => setForm(f => ({ ...f, content_cadence: { ...f.content_cadence, social_per_day: parseInt(e.target.value) } }))}
                  className={inputCls} />
              </Field>
              <Field label="Content: Posts/Week (Blog)">
                <input type="number" min={0} max={7} value={form.content_cadence.blog_per_week}
                  onChange={e => setForm(f => ({ ...f, content_cadence: { ...f.content_cadence, blog_per_week: parseInt(e.target.value) } }))}
                  className={inputCls} />
              </Field>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 py-2 rounded-xl text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white py-2 rounded-xl text-sm transition-all font-medium shadow-lg shadow-indigo-500/20">
                  {saving ? 'Creating...' : 'Create brand'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {brands.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
          <p className="text-slate-500 text-sm">No brands yet. Add your first one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {brands.map((b) => {
            const cadence = JSON.parse(b.content_cadence || '{}');
            return (
              <div key={b.id}
                onClick={() => router.push(`/brands/${b.id}`)}
                className="group relative border border-slate-200 hover:border-slate-300 rounded-2xl p-6 cursor-pointer transition-all duration-200 overflow-hidden bg-white shadow-sm hover:shadow-md">
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl"
                  style={{ background: `radial-gradient(ellipse at top left, ${b.primary_color}10, transparent 60%)` }}
                />
                <div className="relative flex items-center gap-3 mb-5">
                  <div
                    className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm shadow-lg"
                    style={{ backgroundColor: b.primary_color, boxShadow: `0 4px 14px ${b.primary_color}40` }}
                  >
                    {b.name[0].toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-slate-900 text-sm">{b.name}</p>
                    {b.website_url && (
                      <p className="text-xs text-slate-500 truncate">{b.website_url.replace(/^https?:\/\//, '')}</p>
                    )}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${b.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-500'}`}>
                    {b.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="relative grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                    <p className="text-xs text-slate-500 mb-0.5">Blog/wk</p>
                    <p className="text-sm font-bold text-slate-900">{cadence.blog_per_week ?? 0}</p>
                  </div>
                  <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                    <p className="text-xs text-slate-500 mb-0.5">Social/day</p>
                    <p className="text-sm font-bold text-slate-900">{cadence.social_per_day ?? 0}</p>
                  </div>
                  <div className="rounded-xl p-2.5 bg-slate-50 border border-slate-100">
                    <p className="text-xs text-slate-500 mb-0.5">Auto-pub</p>
                    <p className="text-sm font-bold text-slate-900">{b.auto_publish ? 'On' : 'Off'}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
