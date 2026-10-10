import type { WorkerEnv, ContentItem } from './types';
import { generateId } from './crypto';

// Sends a due 'scheduled' item on its way: social posts and CMS items go to their queues,
// blog/email items (which live in D1) are marked published directly.
export async function releaseContentItem(env: WorkerEnv, item: ContentItem): Promise<void> {
  let socialAccountId = item.social_account_id;

  // If this is a social post but social_account_id wasn't set at generation time,
  // look up the active account for this brand + platform now.
  if (!socialAccountId && item.content_type === 'social' && item.platform) {
    const account = await env.DB.prepare(
      `SELECT id FROM social_accounts WHERE brand_id = ? AND platform = ? AND is_active = 1 LIMIT 1`
    ).bind(item.brand_id, item.platform).first<{ id: string }>();
    if (account) {
      socialAccountId = account.id;
      await env.DB.prepare(
        `UPDATE content_items SET social_account_id = ? WHERE id = ?`
      ).bind(socialAccountId, item.id).run();
    }
  }

  if (socialAccountId) {
    // Mark as queued immediately so nothing else re-picks it
    await env.DB.prepare(
      `UPDATE content_items SET status = 'queued', updated_at = unixepoch() WHERE id = ?`
    ).bind(item.id).run();
    await env.SOCIAL_POSTING_QUEUE.send({
      jobId: generateId(),
      jobType: 'post_social',
      brandId: item.brand_id,
      payload: { contentItemId: item.id, socialAccountId },
    });
  } else if (item.cms_connection_id) {
    await env.DB.prepare(
      `UPDATE content_items SET status = 'queued', updated_at = unixepoch() WHERE id = ?`
    ).bind(item.id).run();
    await env.CONTENT_PUBLISHING_QUEUE.send({
      jobId: generateId(),
      jobType: 'publish_content',
      brandId: item.brand_id,
      payload: { contentItemId: item.id },
    });
  } else if (item.content_type === 'social') {
    // Social post with no connected account — mark failed so it doesn't loop
    console.warn(`[Release] Social item ${item.id} (${item.platform ?? 'n/a'}) has no connected account — marking failed`);
    await env.DB.prepare(
      `UPDATE content_items SET status = 'failed', updated_at = unixepoch() WHERE id = ?`
    ).bind(item.id).run();
  } else if (item.content_type === 'blog' || item.content_type === 'email') {
    // Blog/email lives in D1 — publishing means marking published directly
    console.log(`[Release] Publishing ${item.content_type} item ${item.id} directly`);
    await env.DB.prepare(
      `UPDATE content_items SET status = 'published', published_at = unixepoch(), scheduled_for = NULL, updated_at = unixepoch() WHERE id = ?`
    ).bind(item.id).run();
  } else {
    // Unknown type with no delivery target — revert to draft
    await env.DB.prepare(
      `UPDATE content_items SET status = 'draft', scheduled_for = NULL, updated_at = unixepoch() WHERE id = ?`
    ).bind(item.id).run();
  }
}
