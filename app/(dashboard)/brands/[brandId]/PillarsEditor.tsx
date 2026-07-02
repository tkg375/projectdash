'use client';

import { useState } from 'react';

export default function PillarsEditor({ brandId, initial }: { brandId: string; initial: string[] }) {
  const [pillars, setPillars] = useState<string[]>(initial);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(updated: string[]) {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/brands/${brandId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_pillars: updated }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addPillar() {
    const trimmed = input.trim();
    if (!trimmed || pillars.includes(trimmed)) { setInput(''); return; }
    const updated = [...pillars, trimmed];
    setPillars(updated);
    setInput('');
    save(updated);
  }

  function removePillar(p: string) {
    const updated = pillars.filter(x => x !== p);
    setPillars(updated);
    save(updated);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); addPillar(); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500">Content Pillars</p>
        {saving && <span className="text-xs text-slate-400">Saving…</span>}
        {saved && <span className="text-xs text-emerald-600">Saved</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {pillars.map(p => (
          <span key={p} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
            {p}
            <button onClick={() => removePillar(p)} className="text-slate-400 hover:text-red-500 transition-colors leading-none ml-0.5">×</button>
          </span>
        ))}
        {pillars.length === 0 && <span className="text-xs text-slate-400">No pillars yet — add some below</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add pillar (press Enter)"
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400"
        />
        <button
          onClick={addPillar}
          disabled={!input.trim()}
          className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 border border-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-xl transition-colors">
          Add
        </button>
      </div>
    </div>
  );
}
