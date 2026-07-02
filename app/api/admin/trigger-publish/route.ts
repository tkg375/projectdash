import { NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

// Manual trigger for the publish scheduler — same logic as the worker cron
export async function POST() {
  const db = await getDb();
  const env = await getEnv();
  const now = Math.floor(Date.now() / 1000);

  const result = await db.prepare(
    `SELECT * FROM content_items WHERE status = 'scheduled' AND scheduled_for <= ? LIMIT 50`
  ).bind(now).all<{
    id: string; brand_id: string; social_account_id: string | null; cms_connection_id: string | null;
  }>();

  const items = result.results;
  const queued: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const socialQueue = (env as unknown as { SOCIAL_POSTING_QUEUE: Queue }).SOCIAL_POSTING_QUEUE;
  const cmsQueue = (env as unknown as { CONTENT_PUBLISHING_QUEUE: Queue }).CONTENT_PUBLISHING_QUEUE;

  for (const item of items) {
    try {
      if (item.social_account_id) {
        await socialQueue.send({
          jobId: generateId(),
          jobType: 'post_social',
          brandId: item.brand_id,
          payload: { contentItemId: item.id, socialAccountId: item.social_account_id },
        });
        queued.push(item.id);
      } else if (item.cms_connection_id) {
        await cmsQueue.send({
          jobId: generateId(),
          jobType: 'publish_content',
          brandId: item.brand_id,
          payload: { contentItemId: item.id },
        });
        queued.push(item.id);
      } else {
        skipped.push(item.id);
      }
    } catch (err) {
      errors.push(`${item.id}: ${String(err)}`);
    }
  }

  return NextResponse.json({ found: items.length, queued, skipped, errors });
}
