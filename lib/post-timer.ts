import { getEnv } from '@/lib/db';

// Arms the PostTimer Durable Object (defined in the workers script) for a scheduled content item.
// It fires at `at` (unix seconds), or immediately if `at` is now or in the past.
export async function armPostTimer(contentItemId: string, at: number): Promise<void> {
  const env = await getEnv();
  const stub = env.POST_TIMER.get(env.POST_TIMER.idFromName(contentItemId)) as unknown as {
    arm(contentItemId: string, at: number): Promise<void>;
  };
  await stub.arm(contentItemId, at);
}
