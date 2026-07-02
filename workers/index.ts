import type { WorkerEnv, QueueMessage } from './lib/types';
import { runScheduled } from './lib/scheduler';
import { generateBlogPost, generateSocialPosts, generateEmailNewsletter, generateVideoAd, publishContentToCms } from './lib/content-generator';
import { dispatchSocialPost } from './lib/social-poster';
import { checkKeywordRankings, generateSeoArticle } from './lib/seo';
import { processAnalyticsSync } from './lib/analytics';
import { sendCampaignBatch } from './lib/email';
import { getBrand, updateJobStatus } from './lib/db';

async function processQueueMessage(msg: QueueMessage, env: WorkerEnv): Promise<void> {
  const { jobId, jobType, brandId, payload } = msg;

  console.log(`[Worker] Processing ${jobType} job ${jobId}`);

  switch (jobType) {
    case 'generate_content': {
      if (!brandId) throw new Error('brandId required');
      const brand = await getBrand(env, brandId);
      if (!brand) throw new Error(`Brand ${brandId} not found`);

      const { contentType, platform, count, keyword, topic, forceStatus } = payload as {
        contentType: string; platform?: string; count?: number; keyword?: string; topic?: string; forceStatus?: 'scheduled' | 'draft';
      };

      if (contentType === 'blog') {
        await generateBlogPost(env, brand, keyword, topic, forceStatus);
      } else if (contentType === 'social' && platform) {
        await generateSocialPosts(env, brand, platform, count ?? 1, topic, forceStatus);
      } else if (contentType === 'email') {
        await generateEmailNewsletter(env, brand, topic);
      } else if (contentType === 'video' && topic) {
        await generateVideoAd(env, brand, topic);
      }
      break;
    }

    case 'publish_content': {
      const { contentItemId } = payload as { contentItemId: string };
      const item = await env.DB.prepare(`SELECT * FROM content_items WHERE id = ?`).bind(contentItemId).first<{
        id: string; brand_id: string; title: string | null; body: string; cms_connection_id: string | null;
      }>();
      if (!item) throw new Error('Content item not found');
      if (!item.cms_connection_id) throw new Error('No CMS connection');
      await publishContentToCms(env, item as Parameters<typeof publishContentToCms>[1]);
      break;
    }

    case 'post_social': {
      const { contentItemId, socialAccountId } = payload as { contentItemId: string; socialAccountId: string };
      await dispatchSocialPost(env, contentItemId, socialAccountId);
      break;
    }

    case 'sync_analytics': {
      if (!brandId) throw new Error('brandId required');
      const { connId, service, propertyId } = payload as { connId: string; service: string; propertyId?: string };
      await processAnalyticsSync(env, brandId, connId, service, propertyId);
      break;
    }

    case 'send_email_batch': {
      const { campaignId, batchStart, batchSize } = payload as { campaignId: string; batchStart: number; batchSize: number };
      await sendCampaignBatch(env, campaignId, batchStart, batchSize);
      break;
    }

    case 'seo_rank_check': {
      if (!brandId) throw new Error('brandId required');
      const { websiteUrl } = payload as { websiteUrl: string };
      await checkKeywordRankings(env, brandId, websiteUrl);
      break;
    }

    case 'seo_generate_article': {
      if (!brandId) throw new Error('brandId required');
      const brand = await getBrand(env, brandId);
      if (!brand) throw new Error(`Brand ${brandId} not found`);
      const { keyword } = payload as { keyword: string };
      await generateSeoArticle(env, brand, keyword);
      break;
    }

    default:
      console.warn(`[Worker] Unknown job type: ${jobType}`);
  }

  await updateJobStatus(env, jobId, 'done');
}

export default {
  async queue(batch: MessageBatch<QueueMessage>, env: WorkerEnv): Promise<void> {
    for (const message of batch.messages) {
      try {
        await processQueueMessage(message.body, env);
        message.ack();
      } catch (err) {
        console.error(`[Worker] Job ${message.body.jobId} failed:`, err);
        await updateJobStatus(env, message.body.jobId, 'failed', String(err)).catch(() => {});

        const isLastAttempt = message.attempts >= 3;
        const { jobType, payload } = message.body;
        const errMsg = String(err).slice(0, 500);

        if (isLastAttempt) {
          // Mark the content item as failed so the UI reflects it
          if (jobType === 'post_social' || jobType === 'publish_content') {
            const contentItemId = (payload as { contentItemId?: string }).contentItemId;
            if (contentItemId) {
              await env.DB.prepare(`UPDATE content_items SET status = 'failed', updated_at = unixepoch() WHERE id = ?`)
                .bind(contentItemId).run().catch(() => {});
            }
          }
          // Store error on the social account so the UI shows it
          if (jobType === 'post_social') {
            const socialAccountId = (payload as { socialAccountId?: string }).socialAccountId;
            if (socialAccountId) {
              await env.DB.prepare(`UPDATE social_accounts SET last_error = ? WHERE id = ?`)
                .bind(errMsg, socialAccountId).run().catch(() => {});
            }
          }
          message.ack(); // don't retry further
        } else {
          message.retry({ delaySeconds: 60 });
        }
      }
    }
  },

  async scheduled(event: ScheduledEvent, env: WorkerEnv, _ctx: ExecutionContext): Promise<void> {
    await runScheduled(event.cron, env);
  },
};
