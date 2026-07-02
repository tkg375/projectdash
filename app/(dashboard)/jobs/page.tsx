'use client';

import { useState, useEffect } from 'react';

interface Job {
  id: string; brand_id: string | null; job_type: string; queue_name: string;
  status: string; attempt_count: number; error_message: string | null;
  created_at: number; completed_at: number | null;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot: string }> = {
  queued:     { label: 'Queued',     cls: 'text-zinc-400 bg-zinc-800/60',      dot: 'bg-zinc-500' },
  processing: { label: 'Processing', cls: 'text-amber-400 bg-amber-500/10',    dot: 'bg-amber-400' },
  done:       { label: 'Done',       cls: 'text-emerald-400 bg-emerald-500/10', dot: 'bg-emerald-400' },
  failed:     { label: 'Failed',     cls: 'text-red-400 bg-red-500/10',         dot: 'bg-red-400' },
};

const FILTER_OPTIONS = ['all', 'queued', 'processing', 'done', 'failed'] as const;
type Filter = typeof FILTER_OPTIONS[number];

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const url = filter === 'all' ? '/api/jobs' : `/api/jobs?status=${filter}`;
    fetch(url).then(r => r.json()).then((data: unknown) => { setJobs(data as Job[]); setLoading(false); });
  }, [filter]);

  const counts = jobs.reduce<Record<string, number>>((acc, j) => {
    acc[j.status] = (acc[j.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6 sm:mb-8">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">Job Logs</h1>
          <p className="text-zinc-400 text-sm mt-1">Real-time automation pipeline activity</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_OPTIONS.map(s => {
            const sc = STATUS_CONFIG[s];
            const isActive = filter === s;
            return (
              <button key={s} onClick={() => setFilter(s)}
                className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl capitalize transition-all border ${
                  isActive
                    ? 'bg-white/10 border-white/20 text-white font-medium'
                    : 'bg-white/3 border-white/5 text-zinc-500 hover:text-zinc-300 hover:border-white/10'
                }`}>
                {sc && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? sc.dot : 'bg-zinc-600'}`} />}
                {s}
                {s !== 'all' && counts[s] ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? 'bg-white/10' : 'bg-white/5'}`}>{counts[s]}</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-violet-500/30 border-t-violet-500 animate-spin" />
          Loading jobs…
        </div>
      ) : jobs.length === 0 ? (
        <div className="bg-white/3 border border-white/5 rounded-2xl p-12 text-center">
          <p className="text-4xl mb-3">⚡</p>
          <p className="text-zinc-500 text-sm">No jobs found.</p>
          <p className="text-zinc-600 text-xs mt-1">Jobs appear here when automation runs.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {jobs.map(job => {
            const sc = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued;
            return (
              <div key={job.id} className="bg-white/3 border border-white/5 rounded-2xl p-4 hover:border-white/10 transition-colors">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${sc.dot} ${job.status === 'processing' ? 'animate-pulse' : ''}`} />
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${sc.cls}`}>{sc.label}</span>
                  </div>
                  <span className="text-sm text-white font-medium">{job.job_type}</span>
                  <span className="text-xs text-zinc-600 bg-white/5 px-2 py-0.5 rounded-lg">{job.queue_name}</span>
                  {job.attempt_count > 1 && (
                    <span className="text-xs text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-lg">attempt {job.attempt_count}</span>
                  )}
                  <span className="text-xs text-zinc-600 ml-auto">
                    {new Date(job.created_at * 1000).toLocaleString()}
                  </span>
                </div>
                {job.error_message && (
                  <p className="text-xs text-red-400 mt-2 font-mono bg-red-500/5 border border-red-500/10 rounded-xl p-2.5 leading-relaxed">{job.error_message}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
