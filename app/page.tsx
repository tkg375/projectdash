import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="max-w-6xl mx-auto w-full flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-bold text-slate-900 tracking-tight">Project Dash</span>
        </div>
        <Link href="/login" className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors">Sign in</Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6">
        <div className="text-center max-w-xl">
          <p className="inline-block text-xs font-semibold tracking-wide uppercase text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full mb-5">
            Coming soon
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">
            Automate your brand&apos;s{' '}
            <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
              marketing
            </span>
          </h1>
          <p className="mt-5 text-lg text-slate-500">
            Project Dash generates and schedules blog posts, social content, email newsletters,
            and video ads for your business. We&apos;re not open to new sign-ups yet — check back soon.
          </p>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto w-full px-6 py-8 flex items-center justify-center gap-6 text-xs text-slate-400 border-t border-slate-200">
        <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms of Service</Link>
        <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
      </footer>
    </div>
  );
}
