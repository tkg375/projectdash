'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';

function useCountdown() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return '0s';
  const h = Math.floor(secondsLeft / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = secondsLeft % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function secondsUntilNextCron(nowSec: number): number {
  // Cron fires every 10 minutes at :00, :10, :20, :30, :40, :50
  const minuteOfHour = Math.floor(nowSec / 60) % 60;
  const secondOfMinute = nowSec % 60;
  const minutesIntoCycle = minuteOfHour % 10;
  const secondsIntoCycle = minutesIntoCycle * 60 + secondOfMinute;
  return 600 - secondsIntoCycle;
}

interface Brand { id: string; name: string; primary_color: string; }
interface ContentItem {
  id: string; brand_id: string; content_type: string; platform: string | null;
  title: string | null; body: string; status: string; created_at: number;
  scheduled_for: number | null; published_at: number | null; external_url: string | null;
}
interface Schedule {
  id: string; name: string; brand_ids: string; content_type: string;
  platform: string | null; posts_per_day: number; posts_per_week: number; topic: string | null;
  auto_publish: number; start_date: string; end_date: string; is_active: number;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

const statusColor: Record<string, string> = {
  draft: 'text-slate-500 bg-slate-100',
  scheduled: 'text-amber-600 bg-amber-50 border border-amber-200',
  published: 'text-emerald-600 bg-emerald-50 border border-emerald-200',
  failed: 'text-red-500 bg-red-50 border border-red-200',
};

const statusDot: Record<string, string> = {
  draft: 'bg-slate-400',
  scheduled: 'bg-amber-500',
  published: 'bg-emerald-500',
  failed: 'bg-red-500',
};

const statusBorder: Record<string, string> = {
  draft: '#94a3b8',
  scheduled: '#f59e0b',
  published: '#10b981',
  failed: '#ef4444',
};

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400';

export default function ContentPage() {
  const now = useCountdown();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<'content' | 'schedules'>('content');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [contentByBrand, setContentByBrand] = useState<Record<string, ContentItem[]>>({});
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') ?? 'all');
  const [filterType, setFilterType] = useState('all');
  const [selectedItem, setSelectedItem] = useState<(ContentItem & { brandName: string; brandColor: string }) | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [newScheduledAt, setNewScheduledAt] = useState('');
  const [savingScheduledAt, setSavingScheduledAt] = useState(false);
  const [showGenerate, setShowGenerate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generateProgress, setGenerateProgress] = useState<string[]>([]);
  const [generated, setGenerated] = useState<{ title?: string; body: string; status?: string; brandName: string } | null>(null);
  const [genForm, setGenForm] = useState({
    brand_ids: [] as string[],
    content_type: 'social' as 'blog' | 'social' | 'email',
    platform: 'facebook',
    topic: '',
    keyword: '',
    publish_mode: 'now' as 'draft' | 'now' | 'scheduled',
    scheduled_at: '',
  });

  // Schedule form
  const [showSchedule, setShowSchedule] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [scheduleFreqMode, setScheduleFreqMode] = useState<'daily' | 'weekly'>('daily');
  const [scheduleForm, setScheduleForm] = useState({
    name: '',
    brand_ids: [] as string[],
    content_type: 'social' as 'blog' | 'social' | 'email',
    platform: 'facebook',
    posts_per_day: 1,
    posts_per_week: 0,
    topic: '',
    auto_publish: true,
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  // Edit schedule
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [editFreqMode, setEditFreqMode] = useState<'daily' | 'weekly'>('daily');
  const [editForm, setEditForm] = useState({
    name: '', brand_ids: [] as string[],
    content_type: 'social' as 'blog' | 'social' | 'email',
    platform: 'facebook', posts_per_day: 1, posts_per_week: 0, topic: '',
    auto_publish: true, start_date: '', end_date: '',
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // Drag-to-reorder + minimize
  const [brandOrder, setBrandOrder] = useState<string[]>([]);
  const [minimized, setMinimized] = useState<Set<string>>(new Set());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Search + brand focus
  const [search, setSearch] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  // Per-brand expand state (how many items to show)
  const ITEMS_PER_BRAND = 5;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then((b: unknown) => {
      const list = b as Brand[];
      setBrands(list);
      // Restore saved order, appending any new brands not yet in saved order
      try {
        const saved = JSON.parse(localStorage.getItem('content-brand-order') ?? '[]') as string[];
        const knownIds = new Set(saved);
        const merged = [...saved.filter(id => list.some(b => b.id === id)), ...list.map(b => b.id).filter(id => !knownIds.has(id))];
        setBrandOrder(merged);
      } catch {
        setBrandOrder(list.map(b => b.id));
      }
      if (list.length > 0) {
        setGenForm(f => ({ ...f, brand_ids: list.map(b => b.id) }));
        setScheduleForm(f => ({ ...f, brand_ids: list.map(b => b.id) }));
      }
      loadAllContent(list);
    });
    loadSchedules();
  }, []);

  // Persist brand order to localStorage whenever it changes
  useEffect(() => {
    if (brandOrder.length > 0) {
      localStorage.setItem('content-brand-order', JSON.stringify(brandOrder));
    }
  }, [brandOrder]);

  // Poll every 30 seconds
  useEffect(() => {
    if (brands.length === 0) return;
    const interval = setInterval(() => loadAllContent(brands), 30000);
    return () => clearInterval(interval);
  }, [brands]);

  function loadAllContent(list: Brand[]) {
    const statusParam = searchParams.get('status');
    const qs = statusParam ? `?status=${statusParam}&limit=500` : `?limit=100`;
    Promise.all(list.map(brand =>
      fetch(`/api/content/${brand.id}${qs}`).then(r => r.json()).then(d => ({ id: brand.id, items: d as ContentItem[] }))
    )).then(results => {
      const map: Record<string, ContentItem[]> = {};
      for (const { id, items } of results) map[id] = items;
      setContentByBrand(map);
    });
  }

  function loadSchedules() {
    fetch('/api/schedules').then(r => r.json()).then((d: unknown) => setSchedules(d as Schedule[]));
  }

  function refreshBrandContent(brandId: string) {
    fetch(`/api/content/${brandId}`).then(r => r.json()).then((d: unknown) => {
      setContentByBrand(prev => ({ ...prev, [brandId]: d as ContentItem[] }));
    });
  }

  function toggleBrandInForm(brandId: string, form: 'gen' | 'sched') {
    if (form === 'gen') {
      setGenForm(f => ({
        ...f,
        brand_ids: f.brand_ids.includes(brandId)
          ? f.brand_ids.filter(id => id !== brandId)
          : [...f.brand_ids, brandId],
      }));
    } else {
      setScheduleForm(f => ({
        ...f,
        brand_ids: f.brand_ids.includes(brandId)
          ? f.brand_ids.filter(id => id !== brandId)
          : [...f.brand_ids, brandId],
      }));
    }
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    if (genForm.brand_ids.length === 0) return;
    setGenerating(true);
    setGenerated(null);
    setGenerateError('');
    setGenerateProgress([]);

    const scheduledFor = genForm.publish_mode === 'scheduled' && genForm.scheduled_at
      ? Math.floor(new Date(genForm.scheduled_at).getTime() / 1000)
      : genForm.publish_mode === 'now'
      ? Math.floor(Date.now() / 1000) + 10
      : undefined;
    const forceStatus = genForm.publish_mode === 'draft' ? 'draft' : 'scheduled';

    let lastResult: { title?: string; body: string; status?: string } | null = null;
    let lastBrandName = '';

    for (const brandId of genForm.brand_ids) {
      const brand = brands.find(b => b.id === brandId);
      setGenerateProgress(p => [...p, `Generating for ${brand?.name ?? brandId}...`]);
      try {
        const res = await fetch(`/api/content/${brandId}/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...genForm,
            scheduled_for: scheduledFor,
            force_status: forceStatus,
          }),
        });
        if (res.ok) {
          lastResult = await res.json() as { title?: string; body: string; status?: string };
          lastBrandName = brand?.name ?? '';
          setGenerateProgress(p => [...p.slice(0, -1), `✓ ${brand?.name ?? brandId}`]);
          refreshBrandContent(brandId);
        } else {
          const err = await res.json() as { error?: string };
          setGenerateProgress(p => [...p.slice(0, -1), `✗ ${brand?.name ?? brandId}: ${err.error ?? 'failed'}`]);
        }
      } catch {
        setGenerateProgress(p => [...p.slice(0, -1), `✗ ${brand?.name ?? brandId}: network error`]);
      }
    }

    if (lastResult) setGenerated({ ...lastResult, brandName: lastBrandName });
    setGenerating(false);
  }

  async function handleSaveSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (scheduleForm.brand_ids.length === 0) return;
    setSavingSchedule(true);
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scheduleForm),
    });
    if (res.ok) {
      setShowSchedule(false);
      setScheduleForm(f => ({ ...f, name: '', topic: '' }));
      loadSchedules();
    }
    setSavingSchedule(false);
  }

  async function toggleSchedule(id: string, isActive: boolean) {
    await fetch(`/api/schedules/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    });
    loadSchedules();
  }

  async function deleteSchedule(id: string) {
    if (!confirm('Delete this schedule?')) return;
    await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    setSchedules(prev => prev.filter(s => s.id !== id));
  }

  function openEditSchedule(schedule: Schedule) {
    const isWeekly = (schedule.posts_per_week ?? 0) > 0 && schedule.posts_per_day === 0;
    setEditFreqMode(isWeekly ? 'weekly' : 'daily');
    setEditForm({
      name: schedule.name,
      brand_ids: JSON.parse(schedule.brand_ids) as string[],
      content_type: schedule.content_type as 'blog' | 'social' | 'email',
      platform: schedule.platform ?? 'facebook',
      posts_per_day: schedule.posts_per_day,
      posts_per_week: schedule.posts_per_week ?? 0,
      topic: schedule.topic ?? '',
      auto_publish: !!schedule.auto_publish,
      start_date: schedule.start_date,
      end_date: schedule.end_date,
    });
    setEditingScheduleId(schedule.id);
  }

  async function saveEditSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!editingScheduleId) return;
    setSavingEdit(true);
    await fetch(`/api/schedules/${editingScheduleId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    setSavingEdit(false);
    setEditingScheduleId(null);
    loadSchedules();
  }

  function toggleBrandInEditForm(brandId: string) {
    setEditForm(f => ({
      ...f,
      brand_ids: f.brand_ids.includes(brandId)
        ? f.brand_ids.filter(id => id !== brandId)
        : [...f.brand_ids, brandId],
    }));
  }

  const allContent = brands.flatMap(b => (contentByBrand[b.id] ?? []).map(item => ({ ...item, brand: b })));
  const searchLower = search.toLowerCase();
  const filtered = allContent.filter(item =>
    (filterStatus === 'all' || item.status === filterStatus) &&
    (filterType === 'all' || item.content_type === filterType) &&
    (filterBrand === 'all' || item.brand_id === filterBrand) &&
    (search === '' || item.body.toLowerCase().includes(searchLower) || (item.title ?? '').toLowerCase().includes(searchLower))
  );
  const orderedBrands = brandOrder.length > 0
    ? brandOrder.map(id => brands.find(b => b.id === id)).filter(Boolean) as Brand[]
    : brands;
  const grouped = orderedBrands.map(b => ({
    brand: b,
    items: filtered.filter(i => i.brand_id === b.id),
  })).filter(g => g.items.length > 0);

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Content</h1>
          <p className="text-slate-500 text-sm mt-1">All AI-generated content across your brands</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowSchedule(true)}
            className="flex-1 sm:flex-none border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 text-sm px-4 py-2.5 rounded-xl transition-all font-medium">
            Auto Schedule
          </button>
          <button onClick={() => setShowGenerate(true)}
            className="flex-1 sm:flex-none bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm px-4 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-indigo-500/25">
            Generate
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-200">
        {(['content', 'schedules'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium capitalize transition-all border-b-2 -mb-px ${
              tab === t
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}>
            {t}
            {t === 'schedules' && schedules.length > 0 && (
              <span className="ml-1.5 text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full">{schedules.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Generate modal */}
      {showGenerate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Generate Content</h2>
              <button onClick={() => { setShowGenerate(false); setGenerated(null); setGenerateProgress([]); }} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-6">
              {!generated ? (
                <form onSubmit={handleGenerate} className="space-y-4">
                  {/* Brand multi-select */}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Brands</label>
                    <div className="grid grid-cols-2 gap-2">
                      {brands.map(b => (
                        <button key={b.id} type="button"
                          onClick={() => toggleBrandInForm(b.id, 'gen')}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                            genForm.brand_ids.includes(b.id)
                              ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-white'
                          }`}>
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.primary_color }} />
                          <span className="truncate">{b.name}</span>
                        </button>
                      ))}
                    </div>
                    {genForm.brand_ids.length === 0 && (
                      <p className="text-xs text-red-500 mt-1">Select at least one brand</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Content Type</label>
                    <select value={genForm.content_type}
                      onChange={e => setGenForm(f => ({ ...f, content_type: e.target.value as typeof f.content_type }))}
                      className={inputCls}>
                      <option value="blog">Blog Post</option>
                      <option value="social">Social Media</option>
                      <option value="email">Email Newsletter</option>
                    </select>
                  </div>
                  {genForm.content_type === 'social' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Platform</label>
                      <select value={genForm.platform} onChange={e => setGenForm(f => ({ ...f, platform: e.target.value }))} className={inputCls}>
                        <option value="facebook">Facebook</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="bluesky">Bluesky (300 char limit)</option>
                        <option value="mastodon">Mastodon (500 char limit)</option>
                      </select>
                    </div>
                  )}
                  {genForm.content_type === 'blog' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Target Keyword</label>
                      <input value={genForm.keyword} onChange={e => setGenForm(f => ({ ...f, keyword: e.target.value }))}
                        className={inputCls} placeholder="e.g. best cocktail recipes" />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Topic / Angle</label>
                    <input value={genForm.topic} onChange={e => setGenForm(f => ({ ...f, topic: e.target.value }))}
                      className={inputCls} placeholder="Optional — let AI decide or guide it here" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-2">Publishing</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['draft', 'now', 'scheduled'] as const).map(mode => (
                        <button key={mode} type="button"
                          onClick={() => setGenForm(f => ({ ...f, publish_mode: mode }))}
                          className={`py-2 rounded-lg text-xs font-medium border transition-colors ${
                            genForm.publish_mode === mode
                              ? 'bg-indigo-600 border-indigo-500 text-white'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                          }`}>
                          {mode === 'draft' ? 'Save as Draft' : mode === 'now' ? 'Post Now' : 'Schedule'}
                        </button>
                      ))}
                    </div>
                    {genForm.publish_mode === 'scheduled' && (
                      <input type="datetime-local" value={genForm.scheduled_at}
                        onChange={e => setGenForm(f => ({ ...f, scheduled_at: e.target.value }))}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        className={`${inputCls} mt-2`} required />
                    )}
                  </div>
                  {generateProgress.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                      {generateProgress.map((msg, i) => (
                        <p key={i} className={`text-xs ${msg.startsWith('✓') ? 'text-emerald-600' : msg.startsWith('✗') ? 'text-red-500' : 'text-slate-500'}`}>{msg}</p>
                      ))}
                    </div>
                  )}
                  {generateError && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-500 text-xs">{generateError}</div>
                  )}
                  <button type="submit" disabled={generating || genForm.brand_ids.length === 0}
                    className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm transition-all font-medium shadow-lg shadow-indigo-500/20">
                    {generating ? 'Generating...' : `Generate for ${genForm.brand_ids.length} brand${genForm.brand_ids.length !== 1 ? 's' : ''}`}
                  </button>
                </form>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-slate-500">Last generated — {generated.brandName}</p>
                  {generated.title && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Title</p>
                      <p className="text-slate-900 font-semibold">{generated.title}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Content</p>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700 max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">
                      {generated.body}
                    </div>
                  </div>
                  {generateProgress.length > 0 && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
                      {generateProgress.map((msg, i) => (
                        <p key={i} className={`text-xs ${msg.startsWith('✓') ? 'text-emerald-600' : msg.startsWith('✗') ? 'text-red-500' : 'text-slate-500'}`}>{msg}</p>
                      ))}
                    </div>
                  )}
                  {generated.status === 'scheduled' ? (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-indigo-600 text-xs">
                      {genForm.publish_mode === 'now' ? 'Queued for posting now.'
                        : genForm.publish_mode === 'scheduled' && genForm.scheduled_at
                        ? `Scheduled for ${new Date(genForm.scheduled_at).toLocaleString()}.`
                        : 'Scheduled for auto-publish.'}
                    </div>
                  ) : (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-500 text-xs">
                      Saved as draft.
                    </div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setGenerated(null); setGenerateProgress([]); }}
                      className="flex-1 border border-slate-200 text-slate-500 hover:text-slate-900 py-2 rounded-lg text-sm transition-colors">
                      Generate more
                    </button>
                    <button onClick={() => { setShowGenerate(false); setGenerated(null); setGenerateProgress([]); }}
                      className="flex-1 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-2 rounded-xl text-sm transition-all font-medium">
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auto Schedule modal */}
      {showSchedule && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <div>
                <h2 className="font-semibold text-slate-900">New Auto Schedule</h2>
                <p className="text-xs text-slate-500 mt-0.5">AI will generate and post content daily for the period you set</p>
              </div>
              <button onClick={() => setShowSchedule(false)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-6">
              <form onSubmit={handleSaveSchedule} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Schedule Name</label>
                  <input value={scheduleForm.name} onChange={e => setScheduleForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls} placeholder="e.g. April Facebook Push" required />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Brands</label>
                  <div className="grid grid-cols-2 gap-2">
                    {brands.map(b => (
                      <button key={b.id} type="button"
                        onClick={() => toggleBrandInForm(b.id, 'sched')}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                          scheduleForm.brand_ids.includes(b.id)
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.primary_color }} />
                        <span className="truncate">{b.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Content Type</label>
                    <select value={scheduleForm.content_type}
                      onChange={e => setScheduleForm(f => ({ ...f, content_type: e.target.value as typeof f.content_type }))}
                      className={inputCls}>
                      <option value="social">Social Media</option>
                      <option value="blog">Blog Post</option>
                      <option value="email">Email Newsletter</option>
                    </select>
                  </div>
                  {scheduleForm.content_type === 'social' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Platform</label>
                      <select value={scheduleForm.platform}
                        onChange={e => setScheduleForm(f => ({ ...f, platform: e.target.value }))}
                        className={inputCls}>
                        <option value="facebook">Facebook</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="bluesky">Bluesky (300 char limit)</option>
                        <option value="mastodon">Mastodon (500 char limit)</option>
                      </select>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Frequency</label>
                  <div className="flex gap-2 mb-2">
                    {(['daily', 'weekly'] as const).map(mode => (
                      <button key={mode} type="button"
                        onClick={() => {
                          setScheduleFreqMode(mode);
                          setScheduleForm(f => ({
                            ...f,
                            posts_per_day: mode === 'daily' ? (f.posts_per_day || 1) : 0,
                            posts_per_week: mode === 'weekly' ? (f.posts_per_week || 3) : 0,
                          }));
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${scheduleFreqMode === mode ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'}`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  {scheduleFreqMode === 'daily' ? (
                    <select value={scheduleForm.posts_per_day}
                      onChange={e => setScheduleForm(f => ({ ...f, posts_per_day: Number(e.target.value) }))}
                      className={inputCls}>
                      {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} post{n !== 1 ? 's' : ''} per day</option>)}
                    </select>
                  ) : (
                    <select value={scheduleForm.posts_per_week}
                      onChange={e => setScheduleForm(f => ({ ...f, posts_per_week: Number(e.target.value) }))}
                      className={inputCls}>
                      {[1, 2, 3, 4, 5, 7, 10, 14].map(n => <option key={n} value={n}>{n} post{n !== 1 ? 's' : ''} per week</option>)}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Topic / Focus (optional)</label>
                  <input value={scheduleForm.topic} onChange={e => setScheduleForm(f => ({ ...f, topic: e.target.value }))}
                    className={inputCls} placeholder="Leave blank to let AI decide daily" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date</label>
                    <input type="date" value={scheduleForm.start_date}
                      onChange={e => setScheduleForm(f => ({ ...f, start_date: e.target.value }))}
                      className={inputCls} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date</label>
                    <input type="date" value={scheduleForm.end_date}
                      onChange={e => setScheduleForm(f => ({ ...f, end_date: e.target.value }))}
                      min={scheduleForm.start_date}
                      className={inputCls} required />
                  </div>
                </div>

                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-slate-900">Auto-publish</p>
                    <p className="text-xs text-slate-500">Post immediately when generated</p>
                  </div>
                  <button type="button" onClick={() => setScheduleForm(f => ({ ...f, auto_publish: !f.auto_publish }))}
                    className={`w-10 h-6 rounded-full transition-colors relative ${scheduleForm.auto_publish ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${scheduleForm.auto_publish ? 'left-5' : 'left-1'}`} />
                  </button>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-500">
                  Posts generated daily at 6am ·{' '}
                  {Math.ceil((new Date(scheduleForm.end_date).getTime() - new Date(scheduleForm.start_date).getTime()) / 86400000) + 1} days
                  {scheduleForm.posts_per_day > 0 && ` · ${scheduleForm.posts_per_day}/day`}
                  {scheduleForm.posts_per_week > 0 && ` · max ${scheduleForm.posts_per_week}/week`}
                  {scheduleForm.brand_ids.length > 1 && ` · ${scheduleForm.brand_ids.length} brands`}
                </div>

                <button type="submit" disabled={savingSchedule || scheduleForm.brand_ids.length === 0 || !scheduleForm.name}
                  className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm transition-all font-medium shadow-lg shadow-indigo-500/20">
                  {savingSchedule ? 'Saving...' : 'Create Schedule'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Edit Schedule modal */}
      {editingScheduleId && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-6 border-b border-slate-200">
              <h2 className="font-semibold text-slate-900">Edit Schedule</h2>
              <button onClick={() => setEditingScheduleId(null)} className="text-slate-400 hover:text-slate-700">✕</button>
            </div>
            <div className="p-6">
              <form onSubmit={saveEditSchedule} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Schedule Name</label>
                  <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    className={inputCls} required />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Brands</label>
                  <div className="grid grid-cols-2 gap-2">
                    {brands.map(b => (
                      <button key={b.id} type="button" onClick={() => toggleBrandInEditForm(b.id)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors text-left ${
                          editForm.brand_ids.includes(b.id)
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 hover:bg-white'
                        }`}>
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: b.primary_color }} />
                        <span className="truncate">{b.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Content Type</label>
                    <select value={editForm.content_type}
                      onChange={e => setEditForm(f => ({ ...f, content_type: e.target.value as typeof f.content_type }))}
                      className={inputCls}>
                      <option value="social">Social Media</option>
                      <option value="blog">Blog Post</option>
                      <option value="email">Email Newsletter</option>
                    </select>
                  </div>
                  {editForm.content_type === 'social' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1.5">Platform</label>
                      <select value={editForm.platform} onChange={e => setEditForm(f => ({ ...f, platform: e.target.value }))} className={inputCls}>
                        <option value="facebook">Facebook</option>
                        <option value="linkedin">LinkedIn</option>
                        <option value="bluesky">Bluesky (300 char limit)</option>
                        <option value="mastodon">Mastodon (500 char limit)</option>
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Frequency</label>
                  <div className="flex gap-2 mb-2">
                    {(['daily', 'weekly'] as const).map(mode => (
                      <button key={mode} type="button"
                        onClick={() => {
                          setEditFreqMode(mode);
                          setEditForm(f => ({
                            ...f,
                            posts_per_day: mode === 'daily' ? (f.posts_per_day || 1) : 0,
                            posts_per_week: mode === 'weekly' ? (f.posts_per_week || 3) : 0,
                          }));
                        }}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all capitalize ${editFreqMode === mode ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'}`}>
                        {mode}
                      </button>
                    ))}
                  </div>
                  {editFreqMode === 'daily' ? (
                    <select value={editForm.posts_per_day} onChange={e => setEditForm(f => ({ ...f, posts_per_day: Number(e.target.value) }))} className={inputCls}>
                      {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} post{n !== 1 ? 's' : ''} per day</option>)}
                    </select>
                  ) : (
                    <select value={editForm.posts_per_week} onChange={e => setEditForm(f => ({ ...f, posts_per_week: Number(e.target.value) }))} className={inputCls}>
                      {[1,2,3,4,5,7,10,14].map(n => <option key={n} value={n}>{n} post{n !== 1 ? 's' : ''} per week</option>)}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Topic / Focus (optional)</label>
                  <input value={editForm.topic} onChange={e => setEditForm(f => ({ ...f, topic: e.target.value }))}
                    className={inputCls} placeholder="Leave blank to let AI decide daily" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">Start Date</label>
                    <input type="date" value={editForm.start_date} onChange={e => setEditForm(f => ({ ...f, start_date: e.target.value }))} className={inputCls} required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1.5">End Date</label>
                    <input type="date" value={editForm.end_date} onChange={e => setEditForm(f => ({ ...f, end_date: e.target.value }))} min={editForm.start_date} className={inputCls} required />
                  </div>
                </div>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm text-slate-900">Auto-publish</p>
                    <p className="text-xs text-slate-500">Post immediately when generated</p>
                  </div>
                  <button type="button" onClick={() => setEditForm(f => ({ ...f, auto_publish: !f.auto_publish }))}
                    className={`w-10 h-6 rounded-full transition-colors relative ${editForm.auto_publish ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${editForm.auto_publish ? 'left-5' : 'left-1'}`} />
                  </button>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setEditingScheduleId(null)}
                    className="flex-1 border border-slate-200 text-slate-500 hover:text-slate-900 py-2 rounded-lg text-sm transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={savingEdit || editForm.brand_ids.length === 0}
                    className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm transition-colors">
                    {savingEdit ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Content viewer modal */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => { setSelectedItem(null); setEditingSchedule(false); }}>
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: selectedItem.brandColor }} />
                <span className="text-sm font-semibold text-slate-900">{selectedItem.brandName}</span>
                <span className="text-xs text-slate-400 capitalize">· {selectedItem.content_type}{selectedItem.platform ? ` · ${selectedItem.platform}` : ''}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${statusColor[selectedItem.status] || 'text-slate-500 bg-slate-100'}`}>
                  {selectedItem.status}
                </span>
              </div>
              <button onClick={() => { setSelectedItem(null); setEditingSchedule(false); }} className="text-slate-400 hover:text-slate-700 text-lg leading-none">✕</button>
            </div>
            <div ref={scrollRef} className="overflow-y-auto p-5 flex-1">
              {selectedItem.status === 'published' && selectedItem.published_at && (
                <div className="mb-4 flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-emerald-700 text-xs">Published {new Date(selectedItem.published_at * 1000).toLocaleString()}</span>
                  {selectedItem.external_url && (
                    <a href={selectedItem.external_url} target="_blank" rel="noopener noreferrer"
                      className="ml-auto text-xs text-indigo-600 hover:text-indigo-500">View post →</a>
                  )}
                </div>
              )}
              {selectedItem.status === 'scheduled' && selectedItem.scheduled_for && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse shrink-0" />
                    <div className="flex-1">
                      <span className="text-amber-700 text-xs block">
                        {selectedItem.scheduled_for > now
                          ? `Goes live ${new Date(selectedItem.scheduled_for * 1000).toLocaleString()}`
                          : 'Queued — waiting for next scheduler check'}
                      </span>
                      <span className="text-amber-600 text-sm font-mono font-semibold">
                        {selectedItem.scheduled_for > now
                          ? formatCountdown(selectedItem.scheduled_for - now)
                          : `Next check in ${formatCountdown(secondsUntilNextCron(now))}`}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setEditingSchedule(!editingSchedule);
                        setNewScheduledAt(new Date(selectedItem.scheduled_for! * 1000).toISOString().slice(0, 16));
                      }}
                      className="text-xs text-amber-600 hover:text-amber-800 border border-amber-300 hover:border-amber-400 px-2 py-1 rounded transition-colors shrink-0"
                    >
                      Edit
                    </button>
                  </div>
                  {editingSchedule && (
                    <div className="mt-3 flex gap-2">
                      <input
                        type="datetime-local"
                        value={newScheduledAt}
                        onChange={e => setNewScheduledAt(e.target.value)}
                        min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-400"
                      />
                      <button
                        disabled={savingScheduledAt || !newScheduledAt}
                        onClick={async () => {
                          setSavingScheduledAt(true);
                          const ts = Math.floor(new Date(newScheduledAt).getTime() / 1000);
                          const res = await fetch(`/api/content/${selectedItem.brand_id}?id=${selectedItem.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scheduled_for: ts }),
                          });
                          if (res.ok) {
                            setContentByBrand(prev => ({
                              ...prev,
                              [selectedItem.brand_id]: (prev[selectedItem.brand_id] ?? []).map(i =>
                                i.id === selectedItem.id ? { ...i, scheduled_for: ts } : i
                              ),
                            }));
                            setSelectedItem(prev => prev ? { ...prev, scheduled_for: ts } : null);
                            setEditingSchedule(false);
                          }
                          setSavingScheduledAt(false);
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {savingScheduledAt ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => setEditingSchedule(false)} className="text-slate-400 hover:text-slate-700 text-xs px-2">Cancel</button>
                    </div>
                  )}
                </div>
              )}
              {selectedItem.status === 'failed' && (
                <div className="mb-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                  <span className="text-red-600 text-xs flex-1">Failed to publish</span>
                  <button
                    disabled={retrying}
                    onClick={async () => {
                      setRetrying(true);
                      const scheduledFor = Math.floor(Date.now() / 1000) + 10;
                      const res = await fetch(`/api/content/${selectedItem.brand_id}?id=${selectedItem.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ scheduled_for: scheduledFor }),
                      });
                      if (res.ok) {
                        const updated = { ...selectedItem, status: 'scheduled', scheduled_for: scheduledFor };
                        setSelectedItem(updated);
                        setContentByBrand(prev => ({
                          ...prev,
                          [selectedItem.brand_id]: (prev[selectedItem.brand_id] ?? []).map(i =>
                            i.id === selectedItem.id ? { ...i, status: 'scheduled', scheduled_for: scheduledFor } : i
                          ),
                        }));
                      }
                      setRetrying(false);
                    }}
                    className="text-xs text-red-600 hover:text-red-800 border border-red-300 hover:border-red-400 px-2.5 py-1 rounded transition-colors disabled:opacity-50 shrink-0 font-medium"
                  >
                    {retrying ? 'Retrying...' : 'Retry'}
                  </button>
                </div>
              )}
              {selectedItem.status === 'draft' && (
                <div className="mb-4 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
                  <span className="text-slate-500 text-xs">Draft — created {new Date(selectedItem.created_at * 1000).toLocaleString()}</span>
                </div>
              )}
              {selectedItem.title && <h3 className="text-slate-900 font-bold text-lg mb-4">{selectedItem.title}</h3>}
              {selectedItem.content_type === 'blog' ? (
                <div
                  className="text-slate-700 text-sm leading-relaxed blog-content"
                  dangerouslySetInnerHTML={{ __html: selectedItem.body }}
                />
              ) : (
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{selectedItem.body}</p>
              )}
            </div>
            <div className="p-5 border-t border-slate-200 shrink-0 flex items-center justify-between gap-3">
              <button
                onClick={async () => {
                  setDeleting(true);
                  const res = await fetch(`/api/content/${selectedItem.brand_id}?id=${selectedItem.id}`, { method: 'DELETE' });
                  if (res.ok) {
                    setContentByBrand(prev => ({
                      ...prev,
                      [selectedItem.brand_id]: (prev[selectedItem.brand_id] ?? []).filter(i => i.id !== selectedItem.id),
                    }));
                    setSelectedItem(null);
                  }
                  setDeleting(false);
                }}
                disabled={deleting}
                className="text-sm text-red-500 hover:text-red-700 border border-red-200 hover:border-red-300 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              {(selectedItem.status === 'draft' || selectedItem.status === 'failed') && selectedItem.content_type === 'blog' && (
                <button
                  disabled={publishing}
                  onClick={async () => {
                    setPublishing(true);
                    const res = await fetch(`/api/content/${selectedItem.brand_id}?id=${selectedItem.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ publish: true }),
                    });
                    if (res.ok) {
                      const publishedAt = Math.floor(Date.now() / 1000);
                      setSelectedItem(prev => prev ? { ...prev, status: 'published', published_at: publishedAt } : null);
                      setContentByBrand(prev => ({
                        ...prev,
                        [selectedItem.brand_id]: (prev[selectedItem.brand_id] ?? []).map(i =>
                          i.id === selectedItem.id ? { ...i, status: 'published', published_at: publishedAt } : i
                        ),
                      }));
                    }
                    setPublishing(false);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm px-4 py-1.5 rounded-lg transition-colors font-medium"
                >
                  {publishing ? 'Publishing...' : 'Publish to Site'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Content tab */}
      {tab === 'content' && (
        <>
          {/* Search */}
          <div className="mb-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search content..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 mb-4">
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 transition-colors">
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="queued">Queued</option>
              <option value="published">Published</option>
              <option value="failed">Failed</option>
            </select>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 transition-colors">
              <option value="all">All types</option>
              <option value="blog">Blog</option>
              <option value="social">Social</option>
              <option value="email">Email</option>
            </select>
          </div>

          {/* Brand filter chips */}
          <div className="flex flex-wrap gap-2 mb-6">
            <button
              onClick={() => setFilterBrand('all')}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterBrand === 'all' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'}`}>
              All brands
            </button>
            {brands.map(b => (
              <button key={b.id}
                onClick={() => setFilterBrand(filterBrand === b.id ? 'all' : b.id)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterBrand === b.id ? 'text-white border-transparent' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-400'}`}
                style={filterBrand === b.id ? { backgroundColor: b.primary_color, borderColor: b.primary_color } : {}}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: filterBrand === b.id ? 'rgba(255,255,255,0.7)' : b.primary_color }} />
                {b.name}
                <span className={`ml-0.5 ${filterBrand === b.id ? 'text-white/70' : 'text-slate-400'}`}>
                  {(contentByBrand[b.id] ?? []).length}
                </span>
              </button>
            ))}
          </div>
          {grouped.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3">✨</p>
              <p className="text-slate-500 text-sm">No content yet. Hit Generate or set up an Auto Schedule.</p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(({ brand, items }) => {
                const isMin = minimized.has(brand.id);
                const isDragOver = dragOverId === brand.id && draggedId !== brand.id;
                return (
                <div
                  key={brand.id}
                  draggable
                  onDragStart={() => setDraggedId(brand.id)}
                  onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}
                  onDragOver={e => { e.preventDefault(); setDragOverId(brand.id); }}
                  onDrop={() => {
                    if (!draggedId || draggedId === brand.id) return;
                    setBrandOrder(prev => {
                      const next = [...prev];
                      const fromIdx = next.indexOf(draggedId);
                      const toIdx = next.indexOf(brand.id);
                      if (fromIdx === -1 || toIdx === -1) return prev;
                      next.splice(fromIdx, 1);
                      next.splice(toIdx, 0, draggedId);
                      return next;
                    });
                    setDragOverId(null);
                  }}
                  className={`rounded-xl transition-all ${isDragOver ? 'ring-2 ring-indigo-400 ring-offset-2' : ''} ${draggedId === brand.id ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3 mb-3 cursor-default select-none">
                    {/* Drag handle */}
                    <div className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0" title="Drag to reorder">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>
                        <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
                        <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
                      </svg>
                    </div>
                    <div className="w-5 h-5 rounded-md shrink-0 shadow-md flex items-center justify-center text-white font-bold text-xs"
                      style={{ backgroundColor: brand.primary_color, boxShadow: `0 2px 8px ${brand.primary_color}50` }}>
                      {brand.name[0].toUpperCase()}
                    </div>
                    <h2 className="text-sm font-semibold text-slate-900">{brand.name}</h2>
                    <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{items.length}</span>
                    {/* Minimize toggle */}
                    <button
                      onClick={() => setMinimized(prev => {
                        const next = new Set(prev);
                        if (next.has(brand.id)) next.delete(brand.id);
                        else next.add(brand.id);
                        return next;
                      })}
                      className="ml-auto text-slate-400 hover:text-slate-700 transition-colors p-1 rounded"
                      title={isMin ? 'Expand' : 'Collapse'}
                    >
                      <svg className={`w-4 h-4 transition-transform ${isMin ? '' : 'rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                  {!isMin && (() => {
                    const isExpanded = expanded.has(brand.id);
                    const visible = isExpanded ? items : items.slice(0, ITEMS_PER_BRAND);
                    const hidden = items.length - ITEMS_PER_BRAND;
                    return (
                      <div className="space-y-2">
                        {visible.map(item => (
                          <div key={item.id}
                            onClick={() => setSelectedItem({ ...item, brandName: brand.name, brandColor: brand.primary_color })}
                            className="group relative border border-slate-200 hover:border-slate-300 rounded-xl p-4 cursor-pointer transition-all duration-150 overflow-hidden flex gap-3 bg-white shadow-sm hover:shadow-md">
                            <div className="w-0.5 rounded-full shrink-0 self-stretch" style={{ backgroundColor: statusBorder[item.status] ?? '#94a3b8' }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot[item.status] ?? 'bg-slate-400'} ${item.status === 'scheduled' ? 'animate-pulse' : ''}`} />
                                <span className="text-xs text-slate-500 capitalize">{item.content_type}</span>
                                {item.platform && <span className="text-xs text-slate-400">· {item.platform}</span>}
                                <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[item.status] || 'text-slate-500 bg-slate-100'}`}>
                                  {item.status}
                                </span>
                              </div>
                              {item.title && <p className="text-sm font-semibold text-slate-900 mb-1">{item.title}</p>}
                              <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{item.content_type === 'blog' ? stripHtml(item.body) : item.body}</p>
                              {item.status === 'scheduled' && item.scheduled_for && (
                                <div className="mt-2 flex items-center gap-1.5">
                                  <span className="text-xs text-amber-600 font-mono font-medium">
                                    {item.scheduled_for > now
                                      ? `Posts in ${formatCountdown(item.scheduled_for - now)}`
                                      : `Next check in ${formatCountdown(secondsUntilNextCron(now))}`}
                                  </span>
                                </div>
                              )}
                              {item.status === 'published' && item.published_at && (
                                <p className="mt-1.5 text-xs text-emerald-600">
                                  Published {new Date(item.published_at * 1000).toLocaleString()}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                        {items.length > ITEMS_PER_BRAND && (
                          <button
                            onClick={() => setExpanded(prev => {
                              const next = new Set(prev);
                              if (next.has(brand.id)) next.delete(brand.id); else next.add(brand.id);
                              return next;
                            })}
                            className="w-full text-xs text-slate-500 hover:text-slate-900 border border-dashed border-slate-200 hover:border-slate-400 rounded-xl py-2.5 transition-colors">
                            {isExpanded ? 'Show less' : `Show ${hidden} more`}
                          </button>
                        )}
                      </div>
                    );
                  })()}
                </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Schedules tab */}
      {tab === 'schedules' && (
        <div className="space-y-3">
          {schedules.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-2xl p-12 text-center">
              <p className="text-4xl mb-3">🗓️</p>
              <p className="text-slate-500 text-sm mb-4">No schedules yet.</p>
              <button onClick={() => setShowSchedule(true)}
                className="bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white text-sm px-4 py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-indigo-500/25">
                Create Auto Schedule
              </button>
            </div>
          ) : (
            schedules.map(schedule => {
              const brandIds = JSON.parse(schedule.brand_ids) as string[];
              const scheduleBrands = brands.filter(b => brandIds.includes(b.id));
              const today = new Date().toISOString().slice(0, 10);
              const isRunning = schedule.is_active && schedule.start_date <= today && schedule.end_date >= today;
              const isPast = schedule.end_date < today;
              const isFuture = schedule.start_date > today;

              return (
                <div key={schedule.id} className="bg-white border border-slate-200 hover:border-slate-300 rounded-2xl p-5 transition-all shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">{schedule.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          isPast ? 'text-slate-500 bg-slate-100' :
                          !schedule.is_active ? 'text-slate-500 bg-slate-100' :
                          isRunning ? 'text-emerald-600 bg-emerald-50 border border-emerald-200' :
                          'text-amber-600 bg-amber-50 border border-amber-200'
                        }`}>
                          {isPast ? 'Ended' : !schedule.is_active ? 'Paused' : isRunning ? 'Active' : 'Scheduled'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-3">
                        <span className="capitalize">{schedule.content_type}{schedule.platform ? ` · ${schedule.platform}` : ''}</span>
                        {schedule.posts_per_day > 0 && <span>{schedule.posts_per_day} post{schedule.posts_per_day !== 1 ? 's' : ''}/day</span>}
                        {schedule.posts_per_week > 0 && <span>max {schedule.posts_per_week}/week</span>}
                        <span>{schedule.start_date} → {schedule.end_date}</span>
                        <span>{schedule.auto_publish ? 'Auto-publish on' : 'Draft only'}</span>
                        {schedule.topic && <span>Topic: {schedule.topic}</span>}
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        {scheduleBrands.map(b => (
                          <span key={b.id} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: b.primary_color }} />
                            {b.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {!isPast && (
                        <button onClick={() => toggleSchedule(schedule.id, schedule.is_active === 1)}
                          className={`w-9 h-5 rounded-full transition-colors relative ${schedule.is_active ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                          <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${schedule.is_active ? 'left-4' : 'left-0.5'}`} />
                        </button>
                      )}
                      <button onClick={() => openEditSchedule(schedule)}
                        className="text-xs text-slate-500 hover:text-slate-900 border border-slate-200 hover:border-slate-300 px-2 py-1 rounded transition-colors">
                        Edit
                      </button>
                      <button onClick={() => deleteSchedule(schedule.id)}
                        className="text-xs text-slate-400 hover:text-red-500 border border-slate-200 hover:border-red-200 px-2 py-1 rounded transition-colors">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
