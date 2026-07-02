import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getDb(): Promise<D1Database> {
  const { env } = await getCloudflareContext({ async: true });
  return (env as unknown as { DB: D1Database }).DB;
}

export async function getEnv() {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as import('@/types/env').Env;
}
