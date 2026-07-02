'use client';

import { useState } from 'react';

export default function AutoPublishToggle({ brandId, initialValue }: { brandId: string; initialValue: boolean }) {
  const [enabled, setEnabled] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function toggle() {
    setSaving(true);
    setError('');
    const next = !enabled;
    try {
      const res = await fetch(`/api/brands/${brandId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_publish: next }),
      });
      if (res.ok) {
        setEnabled(next);
      } else {
        const data = await res.json() as { error?: string };
        setError(data.error || `Error ${res.status}`);
      }
    } catch {
      setError('Network error');
    }
    setSaving(false);
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        onClick={toggle}
        disabled={saving}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
          enabled ? 'bg-indigo-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
