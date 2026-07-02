import type { WorkerEnv, Brand, BrandSettings, SocialAccount, ContentItem } from './types';
import { generateId } from './crypto';

export async function getActiveBrands(env: WorkerEnv): Promise<(Brand & BrandSettings)[]> {
  const result = await env.DB.prepare(
    `SELECT b.*, bs.content_cadence, bs.content_pillars, bs.auto_publish, bs.language
     FROM brands b
     JOIN brand_settings bs ON bs.brand_id = b.id
     WHERE b.is_active = 1`
  ).all<Brand & BrandSettings>();
  return result.results;
}

export async function getBrand(env: WorkerEnv, brandId: string): Promise<(Brand & BrandSettings) | null> {
  return env.DB.prepare(
    `SELECT b.*, bs.content_cadence, bs.content_pillars, bs.auto_publish, bs.language
     FROM brands b
     JOIN brand_settings bs ON bs.brand_id = b.id
     WHERE b.id = ?`
  ).bind(brandId).first<Brand & BrandSettings>();
}

export async function getActiveSocialAccounts(env: WorkerEnv, brandId: string): Promise<SocialAccount[]> {
  const result = await env.DB.prepare(
    `SELECT * FROM social_accounts WHERE brand_id = ? AND is_active = 1`
  ).bind(brandId).all<SocialAccount>();
  return result.results;
}

export async function getScheduledContent(env: WorkerEnv): Promise<ContentItem[]> {
  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(
    `SELECT * FROM content_items WHERE status = 'scheduled' AND scheduled_for <= ? LIMIT 50`
  ).bind(now).all<ContentItem>();
  return result.results;
}

export async function saveContent(env: WorkerEnv, item: {
  brandId: string;
  contentType: string;
  platform?: string;
  title?: string;
  body: string;
  status?: string;
  scheduledFor?: number;
  publishedAt?: number;
  socialAccountId?: string;
  cmsCconnectionId?: string;
  aiModel?: string;
}): Promise<string> {
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO content_items (id, brand_id, content_type, platform, title, body, status, scheduled_for, published_at, social_account_id, cms_connection_id, ai_model)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id, item.brandId, item.contentType, item.platform ?? null, item.title ?? null,
    item.body, item.status ?? 'draft', item.scheduledFor ?? null, item.publishedAt ?? null,
    item.socialAccountId ?? null, item.cmsCconnectionId ?? null, item.aiModel ?? null
  ).run();
  return id;
}

export async function updateContentStatus(env: WorkerEnv, id: string, status: string, extra: Record<string, unknown> = {}): Promise<void> {
  const fields = ['status = ?'];
  const values: unknown[] = [status];
  if (extra.published_at) { fields.push('published_at = ?'); values.push(extra.published_at); }
  if (extra.external_id) { fields.push('external_id = ?'); values.push(extra.external_id); }
  if (extra.external_url) { fields.push('external_url = ?'); values.push(extra.external_url); }
  values.push(id);
  await env.DB.prepare(`UPDATE content_items SET ${fields.join(', ')}, updated_at = unixepoch() WHERE id = ?`).bind(...values).run();
}

export async function logJob(env: WorkerEnv, opts: {
  id: string;
  brandId?: string;
  jobType: string;
  queueName: string;
  payload: unknown;
  status?: string;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO job_logs (id, brand_id, job_type, queue_name, payload, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
  ).bind(opts.id, opts.brandId ?? null, opts.jobType, opts.queueName, JSON.stringify(opts.payload), opts.status ?? 'queued').run();
}

export async function updateJobStatus(env: WorkerEnv, id: string, status: string, error?: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE job_logs SET status = ?, error_message = ?, completed_at = unixepoch(),
     attempt_count = attempt_count + 1 WHERE id = ?`
  ).bind(status, error ?? null, id).run();
}

export async function upsertAnalyticsSnapshot(env: WorkerEnv, opts: {
  brandId: string;
  service: string;
  metricDate: string;
  metrics: unknown;
}): Promise<void> {
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO analytics_snapshots (id, brand_id, service, metric_date, metrics)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(brand_id, service, metric_date) DO UPDATE SET metrics = excluded.metrics`
  ).bind(id, opts.brandId, opts.service, opts.metricDate, JSON.stringify(opts.metrics)).run();
}

export async function getKeywordsForRankCheck(env: WorkerEnv, brandId: string): Promise<Array<{ id: string; keyword: string; current_rank: number | null }>> {
  const result = await env.DB.prepare(
    `SELECT id, keyword, current_rank FROM seo_keywords WHERE brand_id = ? AND is_tracking = 1`
  ).bind(brandId).all<{ id: string; keyword: string; current_rank: number | null }>();
  return result.results;
}

export async function saveKeywordRanking(env: WorkerEnv, keywordId: string, rank: number | null, url?: string): Promise<void> {
  const id = generateId();
  await env.DB.prepare(
    `INSERT INTO keyword_rankings (id, keyword_id, rank, url) VALUES (?, ?, ?, ?)`
  ).bind(id, keywordId, rank, url ?? null).run();
  await env.DB.prepare(
    `UPDATE seo_keywords SET current_rank = ?, last_checked_at = unixepoch() WHERE id = ?`
  ).bind(rank, keywordId).run();
}
