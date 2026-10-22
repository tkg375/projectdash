import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { DB: D1Database }).DB;
}

export async function getEnv() {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as import('@/types/env').Env;
}

// Blog posts for a brand with an active CMS connection are delivered there (see workers/lib/release.ts).
export async function hasCmsConnection(brandId: string): Promise<boolean> {
  const db = await getDb();
  const row = await db.prepare(`SELECT 1 FROM cms_connections WHERE brand_id = ? AND is_active = 1 LIMIT 1`).bind(brandId).first();
  return !!row;
}
