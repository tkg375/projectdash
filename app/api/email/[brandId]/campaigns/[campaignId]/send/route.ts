import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ brandId: string; campaignId: string }> }) {
  const { brandId, campaignId } = await params;
  const db = await getDb();
  const env = await getEnv();

  const campaign = await db.prepare(
    `SELECT ec.*, el.subscriber_count FROM email_campaigns ec
     JOIN email_lists el ON el.id = ec.list_id
     WHERE ec.id = ? AND ec.brand_id = ?`
  ).bind(campaignId, brandId).first<{ id: string; status: string; subscriber_count: number; list_id: string }>();

  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  if (!['draft', 'scheduled'].includes(campaign.status)) {
    return NextResponse.json({ error: `Cannot send campaign in ${campaign.status} status` }, { status: 400 });
  }

  await db.prepare(`UPDATE email_campaigns SET status = 'sending' WHERE id = ?`).bind(campaignId).run();

  const batchSize = 50;
  const total = campaign.subscriber_count || 0;
  const batches = Math.max(Math.ceil(total / batchSize), 1);

  for (let i = 0; i < batches; i++) {
    await env.EMAIL_DISPATCH_QUEUE.send({
      jobId: generateId(),
      jobType: 'send_email_batch',
      payload: { campaignId, batchStart: i * batchSize, batchSize },
    });
  }

  return NextResponse.json({ success: true, batches });
}
