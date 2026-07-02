'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { label: 'Overview', href: '/' },
  { label: 'Brands', href: '/brands' },
  { label: 'Content', href: '/content' },
  { label: 'SEO', href: '/seo' },
  { label: 'Social', href: '/social' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Email', href: '/email' },
  { label: 'Ads', href: '/ads' },
  { label: 'Jobs', href: '/jobs' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <aside className="w-56 bg-zinc-900 border-r border-zinc-800 flex flex-col shrink-0">
      <div className="p-5 border-b border-zinc-800">
        <span className="text-sm font-bold text-white tracking-wider">PROJECT DASH</span>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ label, href }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`block px-3 py-2 rounded-lg text-sm transition-colors ${
                active
                  ? 'bg-indigo-600 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-zinc-800">
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-2 text-sm text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
