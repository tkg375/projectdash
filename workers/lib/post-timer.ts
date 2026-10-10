import { DurableObject } from 'cloudflare:workers';
import type { WorkerEnv, ContentItem } from './types';
import { releaseContentItem } from './release';

// One instance per content item. Its alarm fires at the item's scheduled_for time and releases it,
// so posts go out at their exact time instead of waiting on a polling cron. An alarm set in the
// past fires immediately, which is how "post now" works.
export class PostTimer extends DurableObject<WorkerEnv> {
  async arm(contentItemId: string, at: number): Promise<void> {
    await this.ctx.storage.put('contentItemId', contentItemId);
    await this.ctx.storage.setAlarm(at * 1000);
  }

  async alarm(): Promise<void> {
    const id = await this.ctx.storage.get<string>('contentItemId');
    if (!id) return;

    const item = await this.env.DB.prepare(`SELECT * FROM content_items WHERE id = ?`).bind(id).first<ContentItem>();
    // Deleted, unscheduled, or already sent — nothing to do
    if (!item || item.status !== 'scheduled' || !item.scheduled_for) {
      await this.ctx.storage.deleteAll();
      return;
    }

    // Moved later without re-arming — wait for the new time
    if (item.scheduled_for * 1000 > Date.now()) {
      await this.ctx.storage.setAlarm(item.scheduled_for * 1000);
      return;
    }

    await releaseContentItem(this.env, item);
    await this.ctx.storage.deleteAll();
  }
}

export async function armPostTimer(env: WorkerEnv, contentItemId: string, at: number): Promise<void> {
  const stub = env.POST_TIMER.get(env.POST_TIMER.idFromName(contentItemId));
  await stub.arm(contentItemId, at);
}
