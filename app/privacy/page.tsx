export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto prose prose-slate">
        <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
        <p className="text-sm text-slate-400">Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <p className="text-slate-600 text-sm leading-relaxed mt-6">
          This policy explains what information Project Dash collects and how it is used.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Information We Collect</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          Account information (name, email, password hash), brand and content data you create in the app,
          and OAuth access tokens for third-party platforms you choose to connect (e.g. LinkedIn, Facebook,
          TikTok, Bluesky, Mastodon). Access tokens are stored encrypted and are used solely to publish
          content on your behalf, per the permissions you grant.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">How We Use Information</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          To operate the Service: generating content, scheduling and publishing posts to platforms you
          connect, and displaying analytics for your brands. We do not sell your data.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Third-Party Platforms</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          When you connect a third-party account, that platform&apos;s own privacy policy also governs
          how it handles your data. You can disconnect a platform at any time, which removes our stored
          access token for it.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Data Retention</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          We retain your account and content data for as long as your account is active. You may request
          deletion of your account and associated data at any time.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Contact</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          Questions about this policy can be sent to the account owner.
        </p>
      </div>
    </div>
  );
}
