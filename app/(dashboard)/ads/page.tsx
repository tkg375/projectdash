export const dynamic = 'force-dynamic';

export default function AdsPage() {
  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Ad Manager</h1>
        <p className="text-slate-500 text-sm mt-1">Google Ads + Meta campaigns with AI-generated copy</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-sm">
        <p className="text-5xl mb-4">🚀</p>
        <h2 className="text-slate-900 font-semibold text-lg mb-2">Coming Soon</h2>
        <p className="text-slate-500 text-sm max-w-sm mx-auto">
          AI-generated ad copy, automated bidding rules, and cross-platform campaign management — launching next.
        </p>

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-lg mx-auto">
          {[
            { icon: '🎯', label: 'Google Ads', desc: 'Search & display campaigns' },
            { icon: '📘', label: 'Meta Ads', desc: 'Facebook campaigns' },
            { icon: '🤖', label: 'AI Copy', desc: 'Auto-generated ad variants' },
          ].map(item => (
            <div key={item.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <span className="text-xl">{item.icon}</span>
              <p className="text-slate-900 text-sm font-medium mt-1">{item.label}</p>
              <p className="text-slate-400 text-xs">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
