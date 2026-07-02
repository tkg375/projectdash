'use client';

import { useState, useEffect } from 'react';

const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-slate-900 text-sm focus:outline-none focus:border-indigo-400 transition-colors placeholder-slate-400';

export default function ProfilePage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');
  const [infoErr, setInfoErr] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwErr, setPwErr] = useState('');

  useEffect(() => {
    fetch('/api/profile').then(r => r.json()).then((d: unknown) => {
      const data = d as { email: string; name: string };
      setEmail(data.email ?? '');
      setName(data.name ?? '');
    });
  }, []);

  async function saveInfo(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setInfoMsg('');
    setInfoErr('');
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name }),
    });
    const data = await res.json() as { error?: string };
    if (res.ok) setInfoMsg('Saved.');
    else setInfoErr(data.error ?? 'Failed to save');
    setSaving(false);
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg('');
    setPwErr('');
    if (newPassword !== confirmPassword) { setPwErr('Passwords do not match'); return; }
    if (newPassword.length < 8) { setPwErr('Password must be at least 8 characters'); return; }
    setSavingPassword(true);
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
    const data = await res.json() as { error?: string };
    if (res.ok) {
      setPwMsg('Password updated.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setPwErr(data.error ?? 'Failed to update password');
    }
    setSavingPassword(false);
  }

  return (
    <div className="p-4 sm:p-8 max-w-xl">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Profile</h1>
        <p className="text-slate-500 text-sm mt-1">Update your account details</p>
      </div>

      {/* Account info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Account Info</h2>
        <form onSubmit={saveInfo} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="Your name" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" required />
          </div>
          {infoMsg && <p className="text-xs text-emerald-600">{infoMsg}</p>}
          {infoErr && <p className="text-xs text-red-500">{infoErr}</p>}
          <button type="submit" disabled={saving}
            className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm transition-all font-medium shadow-lg shadow-indigo-500/20">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>

      {/* Change password */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">Change Password</h2>
        <form onSubmit={savePassword} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Current Password</label>
            <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} className={inputCls} required />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">New Password</label>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputCls} required minLength={8} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">Confirm New Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className={inputCls} required />
          </div>
          {pwMsg && <p className="text-xs text-emerald-600">{pwMsg}</p>}
          {pwErr && <p className="text-xs text-red-500">{pwErr}</p>}
          <button type="submit" disabled={savingPassword}
            className="w-full bg-slate-900 hover:bg-slate-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm transition-all font-medium">
            {savingPassword ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
