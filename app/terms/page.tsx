export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-6 py-16">
      <div className="max-w-2xl mx-auto prose prose-slate">
        <h1 className="text-2xl font-bold text-slate-900">Terms of Service</h1>
        <p className="text-sm text-slate-400">Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <p className="text-slate-600 text-sm leading-relaxed mt-6">
          By creating an account and using Project Dash (&quot;the Service&quot;), you agree to these Terms of Service.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Use of the Service</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          Project Dash provides tools to generate and schedule marketing content, including text, images,
          and video, and to publish that content to connected third-party platforms (such as social networks)
          on your behalf, using your explicit authorization via OAuth. You are responsible for the content you
          approve for publishing and for complying with the terms of any third-party platform you connect.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Account Responsibility</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          You are responsible for maintaining the security of your account credentials and for all activity
          under your account.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Third-Party Platforms</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          When you connect a third-party account (e.g. LinkedIn, Facebook, TikTok, Bluesky, Mastodon), you
          grant Project Dash permission to post content to that account per the scopes you approve. You may
          revoke this access at any time from your account settings or the third-party platform directly.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Termination</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          We may suspend or terminate access to the Service for violations of these terms.
        </p>

        <h2 className="text-lg font-semibold text-slate-900 mt-8">Contact</h2>
        <p className="text-slate-600 text-sm leading-relaxed">
          Questions about these terms can be sent to the account owner.
        </p>
      </div>
    </div>
  );
}
