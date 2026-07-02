import type { WorkerEnv } from './types';
import { getActiveBrands } from './db';
import { runContentScheduler } from './content-generator';
import { queueSeoJobs } from './seo';
import { queueAnalyticsSync } from './analytics';
import { scheduleCampaignSend } from './email';
import { generateId } from './crypto';
import { getScheduledContent } from './db';
import { dispatchSocialPost } from './social-poster';

export async function runScheduled(cron: string, env: WorkerEnv): Promise<void> {
  console.log(`[Scheduler] Running cron: ${cron}`);

  switch (cron) {
    // 6am daily — queue content generation for all brands
    case '0 6 * * *':
      await contentSchedulerJob(env);
      break;

    // Every 10min — check for scheduled content ready to publish
    case '*/10 * * * *':
      await publishSchedulerJob(env);
      break;

    // 2am daily — sync analytics for all brands
    case '0 2 * * *':
      await analyticsSchedulerJob(env);
      break;

    // 3am Monday — SEO rank checks + token refresh (combined to stay within 5-trigger limit)
    case '0 3 * * 1':
      await seoWeeklyJob(env);
      await tokenRefreshJob(env);
      break;

    // 7am daily — send scheduled email campaigns
    case '0 7 * * *':
      await scheduleCampaignSend(env);
      break;

    default:
      console.log(`[Scheduler] Unknown cron pattern: ${cron}`);
  }
}

async function contentSchedulerJob(env: WorkerEnv): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Auto-generate based on brand cadence settings
  const brands = await getActiveBrands(env);
  for (const brand of brands) {
    try {
      await runContentScheduler(env, brand);
    } catch (err) {
      console.error(`[ContentScheduler] Brand ${brand.id} failed:`, err);
    }
  }

  // Process user-defined content schedules
  const schedules = await env.DB.prepare(
    `SELECT * FROM content_schedules WHERE is_active = 1 AND start_date <= ? AND end_date >= ?`
  ).bind(today, today).all<{
    id: string; brand_ids: string; content_type: string; platform: string | null;
    posts_per_day: number; posts_per_week: number; topic: string | null; auto_publish: number;
  }>();

  // Start of current ISO week (Monday) for weekly cap checks
  const now2 = new Date();
  const dow = now2.getUTCDay();
  const daysBack = dow === 0 ? 6 : dow - 1;
  const weekStartDate = new Date(now2);
  weekStartDate.setUTCDate(now2.getUTCDate() - daysBack);
  const weekStartStr = weekStartDate.toISOString().slice(0, 10);

  for (const schedule of schedules.results) {
    const brandIds = JSON.parse(schedule.brand_ids) as string[];
    for (const brandId of brandIds) {
      try {
        // Skip if neither limit is configured
        if (schedule.posts_per_day === 0 && schedule.posts_per_week === 0) continue;

        let countToday = schedule.posts_per_day > 0 ? schedule.posts_per_day : 1;

        // If a weekly cap is set, check how many have already been generated this week
        if (schedule.posts_per_week > 0) {
          const generatedThisWeek = await env.DB.prepare(
            `SELECT COUNT(*) as cnt FROM content_items
             WHERE brand_id = ? AND content_type = ?
             AND (? IS NULL OR platform = ?)
             AND date(created_at, 'unixepoch') >= ?`
          ).bind(brandId, schedule.content_type, schedule.platform, schedule.platform, weekStartStr)
           .first<{ cnt: number }>();
          const weekCount = generatedThisWeek?.cnt ?? 0;
          if (weekCount >= schedule.posts_per_week) {
            console.log(`[ContentScheduler] Weekly cap (${schedule.posts_per_week}) reached for schedule ${schedule.id} brand ${brandId}`);
            continue;
          }
          // Don't exceed the weekly cap with today's batch
          const remaining = schedule.posts_per_week - weekCount;
          countToday = Math.min(countToday, remaining);
        }

        // For social posts, skip if there's no active account for this platform
        if (schedule.content_type === 'social' && schedule.platform) {
          const hasAccount = await env.DB.prepare(
            `SELECT 1 FROM social_accounts WHERE brand_id = ? AND platform = ? AND is_active = 1 LIMIT 1`
          ).bind(brandId, schedule.platform).first();
          if (!hasAccount) {
            console.log(`[ContentScheduler] No active ${schedule.platform} account for brand ${brandId} — skipping schedule ${schedule.id}`);
            continue;
          }
        }

        await env.CONTENT_GENERATION_QUEUE.send({
          jobId: generateId(),
          jobType: 'generate_content',
          brandId,
          payload: {
            contentType: schedule.content_type,
            platform: schedule.platform ?? undefined,
            count: countToday,
            topic: schedule.topic ?? undefined,
            forceStatus: schedule.auto_publish ? 'scheduled' : 'draft',
          },
        });
        console.log(`[ContentScheduler] Queued ${countToday}x ${schedule.content_type} for brand ${brandId} via schedule ${schedule.id}`);
      } catch (err) {
        console.error(`[ContentScheduler] Schedule ${schedule.id} brand ${brandId} failed:`, err);
      }
    }
  }
}

async function publishSchedulerJob(env: WorkerEnv): Promise<void> {
  const items = await getScheduledContent(env);

  for (const item of items) {
    try {
      let socialAccountId = item.social_account_id;

      // If this is a social post but social_account_id wasn't set at generation time,
      // look up the active account for this brand + platform now.
      if (!socialAccountId && item.content_type === 'social' && item.platform) {
        const account = await env.DB.prepare(
          `SELECT id FROM social_accounts WHERE brand_id = ? AND platform = ? AND is_active = 1 LIMIT 1`
        ).bind(item.brand_id, item.platform).first<{ id: string }>();
        if (account) {
          socialAccountId = account.id;
          // Persist for next time so we don't query on every tick
          await env.DB.prepare(
            `UPDATE content_items SET social_account_id = ? WHERE id = ?`
          ).bind(socialAccountId, item.id).run();
        }
      }

      if (socialAccountId) {
        // Mark as queued immediately so the next cron tick doesn't re-pick it
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
        // Mark as queued immediately so the next cron tick doesn't re-pick it
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
        console.warn(`[PublishScheduler] Social item ${item.id} (${item.platform ?? 'n/a'}) has no connected account — marking failed`);
        await env.DB.prepare(
          `UPDATE content_items SET status = 'failed', updated_at = unixepoch() WHERE id = ?`
        ).bind(item.id).run();
      } else if (item.content_type === 'blog' || item.content_type === 'email') {
        // Blog/email lives in D1 — publishing means marking published directly
        console.log(`[PublishScheduler] Publishing ${item.content_type} item ${item.id} directly`);
        await env.DB.prepare(
          `UPDATE content_items SET status = 'published', published_at = unixepoch(), scheduled_for = NULL, updated_at = unixepoch() WHERE id = ?`
        ).bind(item.id).run();
      } else {
        // Unknown type with no delivery target — revert to draft
        await env.DB.prepare(
          `UPDATE content_items SET status = 'draft', scheduled_for = NULL, updated_at = unixepoch() WHERE id = ?`
        ).bind(item.id).run();
      }
    } catch (err) {
      console.error(`[PublishScheduler] Item ${item.id} failed:`, err);
    }
  }
}

async function analyticsSchedulerJob(env: WorkerEnv): Promise<void> {
  const brands = await getActiveBrands(env);
  for (const brand of brands) {
    try {
      await queueAnalyticsSync(env, brand.id);
    } catch (err) {
      console.error(`[AnalyticsScheduler] Brand ${brand.id} failed:`, err);
    }
  }
}

async function seoWeeklyJob(env: WorkerEnv): Promise<void> {
  const brands = await getActiveBrands(env);
  for (const brand of brands) {
    try {
      await queueSeoJobs(env, brand);
    } catch (err) {
      console.error(`[SEOScheduler] Brand ${brand.id} failed:`, err);
    }
  }
}

async function tokenRefreshJob(env: WorkerEnv): Promise<void> {
  const soon = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days from now
  const expiring = await env.DB.prepare(
    `SELECT id, platform, refresh_token FROM social_accounts
     WHERE is_active = 1 AND token_expires_at IS NOT NULL AND token_expires_at < ?`
  ).bind(soon).all<{ id: string; platform: string; refresh_token: string | null }>();

  for (const account of expiring.results) {
    if (!account.refresh_token) continue;
    try {
      // Platform-specific token refresh is handled in social-poster.ts
      // We just flag these accounts — the next posting attempt will refresh
      await env.DB.prepare(
        `UPDATE social_accounts SET last_error = 'token_refresh_pending' WHERE id = ?`
      ).bind(account.id).run();
    } catch (err) {
      console.error(`[TokenRefresh] Account ${account.id} failed:`, err);
    }
  }
}
