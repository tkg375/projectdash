'use client';

import { useState, useEffect } from 'react';

interface Brand { id: string; name: string; }
interface EmailList { id: string; name: string; active_count: number; }
interface Campaign {
  id: string; subject: string; from_name: string; status: string;
  list_name: string; scheduled_for: number | null; sent_at: number | null;
  recipient_count: number; open_count: number;
}

export default function EmailPage() {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState('');
  const [lists, setLists] = useState<EmailList[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [tab, setTab] = useState<'campaigns' | 'lists'>('campaigns');
  const [showNewList, setShowNewList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ list_id: '', subject: '', from_name: '', from_email: '', content_item_id: '' });

  useEffect(() => {
    fetch('/api/brands').then(r => r.json()).then((b: unknown) => {
      const list = b as Brand[];
      setBrands(list);
      if (list.length > 0) setSelectedBrand(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!selectedBrand) return;
    fetch(`/api/email/${selectedBrand}/lists`).then(r => r.json()).then((l: unknown) => setLists(l as EmailList[]));
    fetch(`/api/email/${selectedBrand}/campaigns`).then(r => r.json()).then((c: unknown) => setCampaigns(c as Campaign[]));
  }, [selectedBrand]);

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/email/${selectedBrand}/lists`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newListName }),
    });
    setNewListName('');
    setShowNewList(false);
    fetch(`/api/email/${selectedBrand}/lists`).then(r => r.json()).then((l: unknown) => setLists(l as EmailList[]));
  }

  async function createCampaign(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/email/${selectedBrand}/campaigns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(campaignForm),
    });
    setShowNewCampaign(false);
    fetch(`/api/email/${selectedBrand}/campaigns`).then(r => r.json()).then((c: unknown) => setCampaigns(c as Campaign[]));
  }

  async function sendNow(campaignId: string) {
    await fetch(`/api/email/${selectedBrand}/campaigns/${campaignId}/send`, { method: 'POST' });
    fetch(`/api/email/${selectedBrand}/campaigns`).then(r => r.json()).then((c: unknown) => setCampaigns(c as Campaign[]));
  }

  const statusConfig: Record<string, { label: string; cls: string }> = {
    draft: { label: 'Draft', cls: 'text-slate-500 bg-slate-100' },
    scheduled: { label: 'Scheduled', cls: 'text-amber-600 bg-amber-50 border border-amber-200' },
    sending: { label: 'Sending…', cls: 'text-blue-600 bg-blue-50 border border-blue-200' },
    sent: { label: 'Sent', cls: 'text-emerald-600 bg-emerald-50 border border-emerald-200' },
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Email Campaigns</h1>
          <p className="text-slate-500 text-sm mt-1">Send newsletters via AWS SES with auto-personalization</p>
        </div>
        <div className="flex gap-3 items-center">
          <select value={selectedBrand} onChange={e => setSelectedBrand(e.target.value)}
            className="flex-1 sm:flex-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none">
            {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <button onClick={() => tab === 'lists' ? setShowNewList(true) : setShowNewCampaign(true)}
            className="shrink-0 bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 text-white text-sm px-4 py-2 rounded-xl transition-all font-medium shadow-sm shadow-blue-500/20">
            {tab === 'lists' ? 'New list' : 'New campaign'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-slate-100 border border-slate-200 rounded-xl p-1 w-fit">
        {(['campaigns', 'lists'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm capitalize transition-all ${tab === t ? 'bg-white text-slate-900 font-medium shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'lists' && (
        <>
          {showNewList && (
            <form onSubmit={createList} className="mb-4 flex gap-3">
              <input value={newListName} onChange={e => setNewListName(e.target.value)} autoFocus
                className={inputCls}
                placeholder="List name" />
              <button type="submit" className="bg-gradient-to-r from-sky-500 to-blue-600 text-white px-4 py-2 rounded-xl text-sm font-medium">Create</button>
              <button type="button" onClick={() => setShowNewList(false)} className="border border-slate-200 text-slate-500 px-4 py-2 rounded-xl text-sm hover:text-slate-900 transition-colors">Cancel</button>
            </form>
          )}
          <div className="space-y-2">
            {lists.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                <p className="text-4xl mb-3">📬</p>
                <p className="text-slate-500 text-sm">No lists yet. Create one and add subscribers.</p>
              </div>
            ) : lists.map(list => (
              <div key={list.id} className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between hover:border-slate-300 transition-colors shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-600 text-sm">
                    📋
                  </div>
                  <div>
                    <p className="text-slate-900 font-medium text-sm">{list.name}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{list.active_count} active subscribers</p>
                  </div>
                </div>
                <a href={`/api/email/${selectedBrand}/lists/${list.id}/subscribers`}
                  className="text-xs text-sky-600 hover:text-sky-500 transition-colors">
                  Manage →
                </a>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'campaigns' && (
        <>
          {showNewCampaign && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl">
                <div className="flex items-center justify-between p-5 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900 text-sm">New Campaign</h2>
                  <button onClick={() => setShowNewCampaign(false)} className="text-slate-400 hover:text-slate-700 transition-colors text-lg leading-none">✕</button>
                </div>
                <form onSubmit={createCampaign} className="p-5 space-y-3">
                  <Field label="List">
                    <select value={campaignForm.list_id} onChange={e => setCampaignForm(f => ({ ...f, list_id: e.target.value }))} className={inputCls} required>
                      <option value="">Select list...</option>
                      {lists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.active_count})</option>)}
                    </select>
                  </Field>
                  <Field label="Subject line">
                    <input value={campaignForm.subject} onChange={e => setCampaignForm(f => ({ ...f, subject: e.target.value }))} className={inputCls} required />
                  </Field>
                  <Field label="From name">
                    <input value={campaignForm.from_name} onChange={e => setCampaignForm(f => ({ ...f, from_name: e.target.value }))} className={inputCls} required />
                  </Field>
                  <Field label="From email">
                    <input type="email" value={campaignForm.from_email} onChange={e => setCampaignForm(f => ({ ...f, from_email: e.target.value }))} className={inputCls} required />
                  </Field>
                  <div className="flex gap-3 pt-2">
                    <button type="button" onClick={() => setShowNewCampaign(false)} className="flex-1 border border-slate-200 text-slate-500 py-2 rounded-xl text-sm hover:text-slate-900 transition-colors">Cancel</button>
                    <button type="submit" className="flex-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:opacity-90 text-white py-2 rounded-xl text-sm font-medium">Create</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {campaigns.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
                <p className="text-4xl mb-3">✉️</p>
                <p className="text-slate-500 text-sm">No campaigns yet. Create your first campaign.</p>
              </div>
            ) : campaigns.map(c => {
              const sc = statusConfig[c.status] ?? { label: c.status, cls: 'text-slate-500 bg-slate-100' };
              const openRate = c.recipient_count > 0 ? Math.round((c.open_count / c.recipient_count) * 100) : null;
              return (
                <div key={c.id} className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-slate-300 transition-colors shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-slate-900 font-medium text-sm">{c.subject}</p>
                      <p className="text-slate-500 text-xs mt-0.5">To: {c.list_name} · From: {c.from_name}</p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    {c.recipient_count > 0 && <span className="text-slate-500">{c.recipient_count.toLocaleString()} sent</span>}
                    {openRate !== null && openRate > 0 && (
                      <span className="text-emerald-600">{openRate}% open rate</span>
                    )}
                    {c.scheduled_for && <span>Scheduled {new Date(c.scheduled_for * 1000).toLocaleDateString()}</span>}
                    {c.status === 'draft' && (
                      <button onClick={() => sendNow(c.id)}
                        className="ml-auto text-sky-600 hover:text-sky-500 transition-colors">
                        Send now →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 text-sm focus:outline-none focus:border-sky-400 placeholder-slate-400';
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>{children}</div>;
}
