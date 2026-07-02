import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 via-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <span className="font-bold text-slate-900 tracking-tight">Project Dash</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">Sign in</Link>
          <Link href="/register" className="text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-indigo-500/25">
            Get started
          </Link>
        </nav>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-16 pb-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 tracking-tight">
          Automate your brand&apos;s{' '}
          <span className="bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600 bg-clip-text text-transparent">
            marketing
          </span>
        </h1>
        <p className="mt-5 text-lg text-slate-500 max-w-2xl mx-auto">
          Project Dash generates and schedules blog posts, social content, email newsletters,
          and video ads for your business — so you can focus on running it.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/register" className="text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white px-6 py-3 rounded-xl transition-all shadow-lg shadow-indigo-500/25">
            Get started free
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 border border-slate-200 px-6 py-3 rounded-xl transition-colors">
            Sign in
          </Link>
        </div>
      </main>

      <footer className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-center gap-6 text-xs text-slate-400 border-t border-slate-200">
        <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms of Service</Link>
        <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy Policy</Link>
      </footer>
    </div>
  );
}
