'use client';

import { useState } from 'react';

interface CadenceEditorProps {
  brandId: string;
  initial: { blog_per_week: number; social_per_day: number; social_per_week: number; email_per_month: number };
}

export default function CadenceEditor({ brandId, initial }: CadenceEditorProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    const res = await fetch(`/api/brands/${brandId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_cadence: form }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const inputCls = 'w-24 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-slate-900 text-sm text-right focus:outline-none focus:border-indigo-400';

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-slate-900">Content Cadence</h2>
        {!editing ? (
          <button onClick={() => setEditing(true)}
            className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors">
            Edit
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); setForm(initial); }}
              className="text-xs text-slate-400 hover:text-slate-700 transition-colors">
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-2 py-0.5 rounded-lg transition-colors">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {saved && (
        <p className="text-xs text-emerald-600 mb-2">Cadence saved.</p>
      )}

      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Blog posts/week</span>
          {editing ? (
            <input type="number" min={0} max={14} value={form.blog_per_week}
              onChange={e => setForm(f => ({ ...f, blog_per_week: Number(e.target.value) }))}
              className={inputCls} />
          ) : (
            <span className="text-slate-900">{form.blog_per_week}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Social posts/day</span>
          {editing ? (
            <input type="number" min={0} max={10} value={form.social_per_day}
              onChange={e => setForm(f => ({ ...f, social_per_day: Number(e.target.value) }))}
              className={inputCls} />
          ) : (
            <span className="text-slate-900">{form.social_per_day}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Social posts/week</span>
          {editing ? (
            <input type="number" min={0} max={70} value={form.social_per_week}
              onChange={e => setForm(f => ({ ...f, social_per_week: Number(e.target.value) }))}
              className={inputCls} />
          ) : (
            <span className="text-slate-900">{form.social_per_week}</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Emails/month</span>
          {editing ? (
            <input type="number" min={0} max={30} value={form.email_per_month}
              onChange={e => setForm(f => ({ ...f, email_per_month: Number(e.target.value) }))}
              className={inputCls} />
          ) : (
            <span className="text-slate-900">{form.email_per_month}</span>
          )}
        </div>
      </div>
    </div>
  );
}
