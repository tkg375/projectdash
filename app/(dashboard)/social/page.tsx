'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

interface Brand { id: string; name: string; primary_color: string; }
interface SocialAccount {
  id: string; platform: string; platform_username: string | null;
  is_active: number; last_error: string | null;
}
interface FbPage { id: string; name: string; }

const PLATFORMS = [
  { id: 'linkedin',  label: 'LinkedIn',  gradient: 'from-sky-500 to-blue-600',    initial: 'in' },
  { id: 'facebook',  label: 'Facebook',  gradient: 'from-blue-500 to-indigo-600', initial: 'f'  },
  { id: 'bluesky',   label: 'Bluesky',   gradient: 'from-sky-400 to-cyan-500',    initial: '🦋' },
  { id: 'mastodon',  label: 'Mastodon',  gradient: 'from-violet-500 to-purple-600', initial: 'M' },
];

function ConnectPanel({
  icon, title, subtitle, children,
}: { icon: string; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{icon}</span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function SocialInner() {
  const searchParams = useSearchParams();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [accountsByBrand, setAccountsByBrand] = useState<Record<string, SocialAccount[]>>({});
  const [brandsLoaded, setBrandsLoaded] = useState(false);

  // Facebook page picker state
  const [fbPages, setFbPages] = useState<FbPage[]>([]);
  const [fbPickKey, setFbPickKey] = useState('');
  const [fbAssignments, setFbAssignments] = useState<Record<string, string>>({});
  const [fbSaving, setFbSaving] = useState(false);
  const [fbSaved, setFbSaved] = useState<string[]>([]);
  const [manualPageId, setManualPageId] = useState('');
  const [manualBrandId, setManualBrandId] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualResult, setManualResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  // Bluesky state
  const [bskyBrandId, setBskyBrandId] = useState('');
  const [bskyHandle, setBskyHandle] = useState('');
  const [bskyPassword, setBskyPassword] = useState('');
  const [bskySaving, setBskySaving] = useState(false);
  const [bskyResult, setBskyResult] = useState<{ ok?: boolean; error?: string; handle?: string } | null>(null);

  // Mastodon state
  const [mastodonBrandId, setMastodonBrandId] = useState('');
  const [mastodonInstance, setMastodonInstance] = useState('');
  const [mastodonToken, setMastodonToken] = useState('');
  const [mastodonSaving, setMastodonSaving] = useState(false);
  const [mastodonResult, setMastodonResult] = useState<{ ok?: boolean; error?: string; username?: string } | null>(null);

  const connected = searchParams.get('connected');
  const error = searchParams.get('error');
  const fbPick = searchParams.get('fb_pick');

  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then((b: unknown) => {
      const list = b as Brand[];
      setBrands(list);
      setBrandsLoaded(true);
      if (list.length > 0) {
        setBskyBrandId(list[0].id);
        setMastodonBrandId(list[0].id);
      }
      Promise.all(list.map(brand =>
        fetch(`/api/social/${brand.id}/accounts`).then(r => r.json()).then(a => ({ id: brand.id, accounts: a as SocialAccount[] }))
      )).then(results => {
        const map: Record<string, SocialAccount[]> = {};
        for (const { id, accounts } of results) map[id] = accounts;
        setAccountsByBrand(map);
      });
    });
  }, []);

  useEffect(() => {
    if (!fbPick) return;
    fetch(`/api/social/facebook-page/pages?key=${encodeURIComponent(fbPick)}`)
      .then(r => r.json())
      .then((d: unknown) => {
        const data = d as { pages: FbPage[] };
        if (data.pages?.length) { setFbPages(data.pages); setFbPickKey(fbPick); }
      });
  }, [fbPick]);

  function reloadBrandAccounts(brandId: string) {
    fetch(`/api/social/${brandId}/accounts`).then(r => r.json()).then((a: unknown) => {
      setAccountsByBrand(prev => ({ ...prev, [brandId]: a as SocialAccount[] }));
    });
  }

  async function disconnect(brandId: string, accountId: string) {
    const res = await fetch(`/api/social/${brandId}/accounts?id=${accountId}`, { method: 'DELETE' });
    if (res.ok) setAccountsByBrand(prev => ({ ...prev, [brandId]: (prev[brandId] ?? []).filter(a => a.id !== accountId) }));
    else alert('Disconnect failed — try again');
  }

  async function addPageById() {
    if (!manualPageId.trim() || !manualBrandId) return;
    setManualSaving(true); setManualResult(null);
    try {
      const res = await fetch('/api/social/facebook-page/add-by-id', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickKey: fbPickKey, pageId: manualPageId.trim(), brandId: manualBrandId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && data.ok) { setManualResult({ ok: true }); reloadBrandAccounts(manualBrandId); setManualPageId(''); setManualBrandId(''); }
      else setManualResult({ error: data.error ?? 'Failed to add page' });
    } catch { setManualResult({ error: 'Network error' }); }
    setManualSaving(false);
  }

  async function connectBluesky() {
    if (!bskyHandle.trim() || !bskyPassword.trim() || !bskyBrandId) return;
    setBskySaving(true); setBskyResult(null);
    try {
      const res = await fetch('/api/social/bluesky', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: bskyBrandId, handle: bskyHandle.trim(), appPassword: bskyPassword.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; handle?: string };
      if (res.ok && data.ok) { setBskyResult({ ok: true, handle: data.handle }); reloadBrandAccounts(bskyBrandId); setBskyHandle(''); setBskyPassword(''); }
      else setBskyResult({ error: data.error ?? 'Failed to connect Bluesky' });
    } catch { setBskyResult({ error: 'Network error' }); }
    setBskySaving(false);
  }

  async function connectMastodon() {
    if (!mastodonInstance.trim() || !mastodonToken.trim() || !mastodonBrandId) return;
    setMastodonSaving(true); setMastodonResult(null);
    try {
      const res = await fetch('/api/social/mastodon', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandId: mastodonBrandId, instanceUrl: mastodonInstance.trim(), accessToken: mastodonToken.trim() }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; username?: string };
      if (res.ok && data.ok) { setMastodonResult({ ok: true, username: data.username }); reloadBrandAccounts(mastodonBrandId); setMastodonInstance(''); setMastodonToken(''); }
      else setMastodonResult({ error: data.error ?? 'Failed to connect Mastodon' });
    } catch { setMastodonResult({ error: 'Network error' }); }
    setMastodonSaving(false);
  }

  async function saveFbAssignments() {
    const entries = Object.entries(fbAssignments).filter(([, brandId]) => brandId);
    if (!entries.length) return;
    setFbSaving(true);
    const saved: string[] = [];
    for (const [pageId, brandId] of entries) {
      const res = await fetch('/api/social/facebook-page', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pickKey: fbPickKey, pageId, brandId }),
      });
      if (res.ok) { saved.push(pageId); reloadBrandAccounts(brandId); }
    }
    setFbSaved(saved); setFbSaving(false);
  }

  const unassignedPages = fbPages.filter(p => !fbSaved.includes(p.id));
  const allAssigned = fbPages.length > 0 && unassignedPages.length === 0;

  const inputCls = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 placeholder-slate-400';
  const selectCls = 'bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none';

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Social Accounts</h1>
        <p className="text-slate-500 text-sm mt-1">Connect platforms to enable auto-posting</p>
      </div>

      {connected && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-700 text-sm">
          Account connected successfully.
        </div>
      )}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-600 text-sm">
          Connection failed: {decodeURIComponent(error)}
        </div>
      )}

      {/* Connect panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">

        {/* Bluesky */}
        <ConnectPanel icon="🦋" title="Connect Bluesky" subtitle="Uses your handle + an app password">
          <div className="space-y-2">
            <input type="text" placeholder="Handle (e.g. you.bsky.social)" value={bskyHandle}
              onChange={e => setBskyHandle(e.target.value)} className={`w-full ${inputCls}`} />
            <input type="password" placeholder="App password (not your main password)" value={bskyPassword}
              onChange={e => setBskyPassword(e.target.value)} className={`w-full ${inputCls}`} />
            <div className="flex gap-2">
              <select value={bskyBrandId} onChange={e => setBskyBrandId(e.target.value)} className={`flex-1 ${selectCls}`}>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={connectBluesky} disabled={bskySaving || !bskyHandle.trim() || !bskyPassword.trim() || !bskyBrandId}
                className="bg-gradient-to-r from-sky-400 to-cyan-500 hover:opacity-90 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all">
                {bskySaving ? 'Verifying…' : 'Connect'}
              </button>
            </div>
          </div>
          {bskyResult?.ok && <p className="mt-2 text-xs text-emerald-600">Connected as @{bskyResult.handle}</p>}
          {bskyResult?.error && <p className="mt-2 text-xs text-red-500">{bskyResult.error}</p>}
          <p className="mt-3 text-xs text-slate-400">Create an app password at bsky.app → Settings → App Passwords.</p>
        </ConnectPanel>

        {/* Mastodon */}
        <ConnectPanel icon="🐘" title="Connect Mastodon" subtitle="Works with any instance">
          <div className="space-y-2">
            <input type="text" placeholder="Instance URL (e.g. https://mastodon.social)" value={mastodonInstance}
              onChange={e => setMastodonInstance(e.target.value)} className={`w-full ${inputCls}`} />
            <input type="password" placeholder="Access token" value={mastodonToken}
              onChange={e => setMastodonToken(e.target.value)} className={`w-full ${inputCls}`} />
            <div className="flex gap-2">
              <select value={mastodonBrandId} onChange={e => setMastodonBrandId(e.target.value)} className={`flex-1 ${selectCls}`}>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={connectMastodon} disabled={mastodonSaving || !mastodonInstance.trim() || !mastodonToken.trim() || !mastodonBrandId}
                className="bg-gradient-to-r from-violet-500 to-purple-600 hover:opacity-90 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-xl font-medium whitespace-nowrap transition-all">
                {mastodonSaving ? 'Verifying…' : 'Connect'}
              </button>
            </div>
          </div>
          {mastodonResult?.ok && <p className="mt-2 text-xs text-emerald-600">Connected as @{mastodonResult.username}</p>}
          {mastodonResult?.error && <p className="mt-2 text-xs text-red-500">{mastodonResult.error}</p>}
          <p className="mt-3 text-xs text-slate-400">Get a token at your instance → Preferences → Development → New Application.</p>
        </ConnectPanel>

      </div>

      {/* Facebook batch page assignment */}
      {fbPages.length > 0 && !allAssigned && brandsLoaded && (
        <div className="mb-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Assign Facebook Pages to Brands</h3>
          <p className="text-xs text-slate-500 mb-4">Assign all your pages now — doing this in one session keeps all tokens valid.</p>
          <div className="space-y-2">
            {fbPages.map(page => {
              const isSaved = fbSaved.includes(page.id);
              return (
                <div key={page.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isSaved ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                  <p className={`flex-1 text-sm font-medium ${isSaved ? 'text-emerald-700' : 'text-slate-900'}`}>{page.name} {isSaved && '✓'}</p>
                  {!isSaved && (
                    <select value={fbAssignments[page.id] ?? ''} onChange={e => setFbAssignments(prev => ({ ...prev, [page.id]: e.target.value }))}
                      className={selectCls}>
                      <option value="">Select brand...</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
          <button onClick={saveFbAssignments} disabled={fbSaving || !Object.values(fbAssignments).some(v => v)}
            className="mt-4 w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white text-sm py-2.5 rounded-xl transition-all font-medium shadow-lg shadow-indigo-500/20">
            {fbSaving ? 'Saving...' : 'Save Assignments'}
          </button>
          <div className="mt-5 pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-600 font-medium mb-1">Don&apos;t see a page?</p>
            <p className="text-xs text-slate-500 mb-3">Pages via Business Manager may not appear above. Enter the page ID manually.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input type="text" placeholder="Page ID" value={manualPageId} onChange={e => setManualPageId(e.target.value)} className={`flex-1 ${inputCls}`} />
              <select value={manualBrandId} onChange={e => setManualBrandId(e.target.value)} className={selectCls}>
                <option value="">Select brand…</option>
                {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={addPageById} disabled={manualSaving || !manualPageId.trim() || !manualBrandId}
                className="bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm px-4 py-2 rounded-xl border border-slate-200 whitespace-nowrap transition-colors">
                {manualSaving ? 'Adding…' : 'Add Page'}
              </button>
            </div>
            {manualResult?.ok && <p className="mt-2 text-xs text-emerald-600">Page connected.</p>}
            {manualResult?.error && <p className="mt-2 text-xs text-red-500">{manualResult.error}</p>}
          </div>
        </div>
      )}

      {allAssigned && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-emerald-700 text-sm">
          All Facebook pages assigned successfully.
        </div>
      )}

      {/* Brand platform grid */}
      <div className="space-y-4">
        {brands.map(brand => {
          const accounts = accountsByBrand[brand.id] ?? [];
          return (
            <div key={brand.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden hover:border-slate-300 transition-colors shadow-sm">
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: brand.primary_color + '20', border: `1px solid ${brand.primary_color}40` }}>
                  <span style={{ color: brand.primary_color }}>{brand.name[0]}</span>
                </div>
                <span className="text-sm font-semibold text-slate-900">{brand.name}</span>
                <span className="text-xs text-slate-400 ml-auto">{accounts.filter(a => a.is_active).length}/{PLATFORMS.length} connected</span>
              </div>
              <div className="divide-y divide-slate-100">
                {PLATFORMS.map(platform => {
                  const account = accounts.find(a => a.platform === platform.id);
                  const noOAuth = ['bluesky', 'mastodon'].includes(platform.id);
                  return (
                    <div key={platform.id} className="flex items-center gap-4 px-5 py-3.5">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br ${platform.gradient}`}>
                        {platform.initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-900">{platform.label}</p>
                        {account?.platform_username && (
                          <p className="text-xs text-slate-400 truncate">@{account.platform_username}</p>
                        )}
                        {account?.last_error && (
                          <p className="text-xs text-amber-600 truncate">{account.last_error}</p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${account?.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-slate-100 text-slate-400'}`}>
                          {account?.is_active ? 'Connected' : 'Not connected'}
                        </span>
                        {account?.is_active ? (
                          <button onClick={() => disconnect(brand.id, account.id)}
                            className="text-xs text-slate-400 hover:text-red-500 transition-colors">
                            Disconnect
                          </button>
                        ) : !noOAuth ? (
                          <a href={`/api/social/${brand.id}/connect/${platform.id}`}
                            className="text-xs bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white px-3 py-1.5 rounded-lg transition-all font-medium shadow-sm shadow-indigo-500/20">
                            Connect
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">Use panel above</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <p className="text-xs text-slate-500">
          <span className="text-slate-700 font-medium">Facebook tip:</span> When connecting Facebook, all your pages appear at once. Assign each page to a brand in that same screen — this keeps all tokens valid.
        </p>
      </div>
    </div>
  );
}

export default function SocialPage() {
  return <Suspense fallback={<div className="p-4 sm:p-8 text-slate-400 text-sm">Loading...</div>}><SocialInner /></Suspense>;
}
