'use client';

import { useState } from 'react';

type BrandVoice = {
  tone: string;
  personality: string;
  avoid: string[];
};

type TargetAudience = {
  who: string;
  description: string;
  goals: string[];
  pain_points: string[];
};

const TONE_OPTIONS = [
  'professional', 'conversational', 'authoritative', 'friendly',
  'educational', 'inspiring', 'empathetic', 'direct',
];

function TagInput({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  function add() {
    const t = input.trim();
    if (!t || tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t]);
    setInput('');
  }

  return (
    <div>
      <p className="text-xs font-medium text-slate-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {tags.map(t => (
          <span key={t} className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded-full border border-slate-200">
            {t}
            <button
              type="button"
              onClick={() => onChange(tags.filter(x => x !== t))}
              className="text-slate-400 hover:text-red-500 transition-colors leading-none ml-0.5"
            >×</button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-xs text-slate-400 self-center">None yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400"
        />
        <button
          type="button"
          onClick={add}
          disabled={!input.trim()}
          className="bg-slate-100 hover:bg-slate-200 disabled:opacity-40 border border-slate-200 text-slate-700 text-xs px-3 py-1.5 rounded-xl transition-colors"
        >Add</button>
      </div>
    </div>
  );
}

export default function BrandVoiceEditor({
  brandId,
  initialVoice,
  initialAudience,
}: {
  brandId: string;
  initialVoice: BrandVoice;
  initialAudience: TargetAudience;
}) {
  const [voice, setVoice] = useState<BrandVoice>({
    tone: initialVoice.tone || '',
    personality: initialVoice.personality || '',
    avoid: initialVoice.avoid || [],
  });
  const [audience, setAudience] = useState<TargetAudience>({
    who: initialAudience.who || '',
    description: initialAudience.description || '',
    goals: initialAudience.goals || [],
    pain_points: initialAudience.pain_points || [],
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setSaved(false);
    setError('');
    const res = await fetch(`/api/brands/${brandId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brand_voice: voice, target_audience: audience }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError('Save failed — try again');
    }
  }

  return (
    <div className="space-y-6">
      {/* Brand Voice */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Brand Voice</h2>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Tone</label>
            <div className="flex flex-wrap gap-1.5">
              {TONE_OPTIONS.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setVoice(v => ({ ...v, tone: t }))}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all capitalize ${
                    voice.tone === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <input
              value={voice.tone}
              onChange={e => setVoice(v => ({ ...v, tone: e.target.value }))}
              placeholder="Or type a custom tone…"
              className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Personality</label>
            <textarea
              value={voice.personality}
              onChange={e => setVoice(v => ({ ...v, personality: e.target.value }))}
              placeholder="e.g. Expert, trustworthy, approachable — speaks like a knowledgeable colleague"
              rows={2}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400 resize-none"
            />
          </div>

          <TagInput
            label="Words / phrases to avoid"
            tags={voice.avoid}
            onChange={avoid => setVoice(v => ({ ...v, avoid }))}
            placeholder="e.g. cheap, guarantee, revolutionary"
          />
        </div>
      </div>

      <div className="border-t border-slate-100 pt-5">
        <h2 className="text-sm font-semibold text-slate-900 mb-1">Target Audience</h2>
        <p className="text-xs text-slate-400 mb-4">This is fed directly into the AI — be specific about who you&apos;re talking to.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Who they are</label>
            <input
              value={audience.who}
              onChange={e => setAudience(a => ({ ...a, who: e.target.value }))}
              placeholder="e.g. Licensed DVMs / veterinary practice owners"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-slate-900 text-xs focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-500 block mb-1.5">Description</label>
            <textarea
              value={audience.description}
              onChange={e => setAudience(a => ({ ...a, description: e.target.value }))}
              placeholder="e.g. Practicing vets who want to add telehealth to their existing practice and earn additional income serving clients they already know — NOT pet owners or consumers."
              rows={3}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-xs focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400 resize-none"
            />
          </div>

          <TagInput
            label="Their goals"
            tags={audience.goals}
            onChange={goals => setAudience(a => ({ ...a, goals }))}
            placeholder="e.g. earn extra income from existing clients"
          />

          <TagInput
            label="Their pain points"
            tags={audience.pain_points}
            onChange={pain_points => setAudience(a => ({ ...a, pain_points }))}
            placeholder="e.g. marketplace platforms take 20-30%"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Saved ✓</span>}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    </div>
  );
}
