'use client';

import { useState, useEffect } from 'react';

interface Brand { id: string; name: string; }
interface Keyword {
  id: string; keyword: string; current_rank: number | null; target_rank: number;
  search_volume: number | null; difficulty: number | null; intent: string;
  is_auto_target: number; latest_rank: number | null;
}

export default function SEOPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newKeyword, setNewKeyword] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then((b: unknown) => {
      const list = b as Brand[];
      setBrands(list);
      if (list.length > 0) setSelectedBrand(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/seo/${selectedBrand}/keywords`).then(r => r.json()).then((k: unknown) => setKeywords(k as Keyword[]));
  }, [selectedBrand]);

  async function addKeyword(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    setAdding(true);
    await fetch(`/api/seo/${selectedBrand}/keywords`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword: newKeyword.trim() }),
    });
    setNewKeyword('');
    setShowAdd(false);
    fetch(`/api/seo/${selectedBrand}/keywords`).then(r => r.json()).then((k: unknown) => setKeywords(k as Keyword[]));
    setAdding(false);
  }

  async function deleteKeyword(id: string) {
    await fetch(`/api/seo/${selectedBrand}/keywords?id=${id}`, { method: 'DELETE' });
    setKeywords(prev => prev.filter(k => k.id !== id));
  }

  function rankBadge(rank: number | null) {
    if (!rank) return <span className="text-zinc-600 text-xs">—</span>;
    if (rank <= 3) return <span className="text-emerald-400 font-bold text-sm">#{rank}</span>;
    if (rank <= 10) return <span className="text-amber-400 font-bold text-sm">#{rank}</span>;
    return <span className="text-zinc-400 text-sm">#{rank}</span>;
  }

  const intentColors: Record<string, string> = {
    informational: 'text-blue-400 bg-blue-500/10',
    navigational: 'text-violet-400 bg-violet-500/10',
    commercial: 'text-amber-400 bg-amber-500/10',
    transactional: 'text-emerald-400 bg-emerald-500/10',
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">SEO Autopilot</h1>
          <p className="text-zinc-400 text-sm mt-1">Keyword tracking + auto-article generation every Monday</p>
        </div>
        <div className="flex gap-3 items-center">
          <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
            className="flex-1 sm:flex-none bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none">
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => setShowAdd(true)}
            className="shrink-0 bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 text-white text-sm px-4 py-2 rounded-xl transition-all font-medium shadow-sm shadow-emerald-500/20">
            + Keyword
          </button>
        </div>
      </div>

      {showAdd && (
        <form onSubmit={addKeyword} className="mb-6 flex gap-3">
          <input value={newKeyword} onChange={e => setNewKeyword(e.target.value)} autoFocus
            className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500/50 placeholder-zinc-600"
            placeholder="e.g. best cocktail bar Nashville" />
          <button type="submit" disabled={adding}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:opacity-90 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium">
            {adding ? 'Adding…' : 'Add'}
          </button>
          <button type="button" onClick={() => setShowAdd(false)}
            className="border border-white/10 text-zinc-400 px-4 py-2 rounded-xl text-sm hover:text-white transition-colors">
            Cancel
          </button>
        </form>
      )}

      {keywords.length === 0 ? (
        <div className="bg-white/3 border border-white/5 rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-zinc-500 text-sm">No keywords yet.</p>
          <p className="text-zinc-600 text-xs mt-1">Add target keywords to track rankings and auto-generate articles.</p>
        </div>
      ) : (
        <div className="bg-white/3 border border-white/5 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-white/5">
              <tr className="text-left text-xs text-zinc-500">
                <th className="px-4 py-3 font-medium">Keyword</th>
                <th className="px-4 py-3 font-medium">Rank</th>
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Intent</th>
                <th className="px-4 py-3 font-medium">Auto-article</th>
                <th className="px-4 py-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {keywords.map(kw => (
                <tr key={kw.id} className="hover:bg-white/3 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{kw.keyword}</td>
                  <td className="px-4 py-3">{rankBadge(kw.latest_rank ?? kw.current_rank)}</td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">Top {kw.target_rank}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${intentColors[kw.intent] ?? 'text-zinc-400 bg-zinc-800/60'}`}>{kw.intent}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${kw.is_auto_target ? 'text-emerald-400 bg-emerald-500/10' : 'text-zinc-500 bg-zinc-800/60'}`}>
                      {kw.is_auto_target ? 'On' : 'Off'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => deleteKeyword(kw.id)} className="text-zinc-600 hover:text-red-400 transition-colors text-base leading-none">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { label: 'Rank checks', value: 'Every Monday, 3am', icon: '📅', gradient: 'from-emerald-500 to-teal-500' },
          { label: 'Article generation', value: 'Auto when rank > target', icon: '✍️', gradient: 'from-blue-500 to-cyan-500' },
          { label: 'Rank data via', value: 'Serper.dev API', icon: '🔎', gradient: 'from-violet-500 to-purple-600' },
        ].map(item => (
          <div key={item.label} className="bg-white/3 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-base">{item.icon}</span>
              <p className="text-xs text-zinc-500">{item.label}</p>
            </div>
            <p className="text-white text-sm font-medium">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
