import type { WorkerEnv } from './types';
import { AwsClient } from 'aws4fetch';
import { generateId } from './crypto';

function getAwsClient(env: WorkerEnv): AwsClient {
  return new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_SES_REGION || 'us-east-1',
    service: 'ses',
  });
}

export async function sendEmail(env: WorkerEnv, opts: {
  to: string;
  fromName: string;
  fromEmail: string;
  replyTo?: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}): Promise<string | null> {
  const aws = getAwsClient(env);
  const region = env.AWS_SES_REGION || 'us-east-1';

  const payload = {
    FromEmailAddress: `${opts.fromName} <${opts.fromEmail}>`,
    Destination: { ToAddresses: [opts.to] },
    ReplyToAddresses: opts.replyTo ? [opts.replyTo] : undefined,
    Content: {
      Simple: {
        Subject: { Data: opts.subject, Charset: 'UTF-8' },
        Body: {
          Html: { Data: opts.htmlBody, Charset: 'UTF-8' },
          ...(opts.textBody ? { Text: { Data: opts.textBody, Charset: 'UTF-8' } } : {}),
        },
      },
    },
  };

  const res = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error('SES send error:', await res.text());
    return null;
  }

  const data = await res.json() as { MessageId: string };
  return data.MessageId;
}

function injectUnsubscribeLink(html: string, unsubscribeUrl: string): string {
  const footer = `
<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e5e5e5;text-align:center;font-size:12px;color:#888;">
  <p>You're receiving this because you subscribed. <a href="${unsubscribeUrl}" style="color:#888;">Unsubscribe</a></p>
</div>`;
  return html.replace(/<\/body>/i, `${footer}</body>`) || html + footer;
}

function personalizeContent(template: string, subscriber: { first_name?: string | null; email: string }): string {
  return template
    .replace(/\{\{first_name\}\}/g, subscriber.first_name || 'there')
    .replace(/\{\{email\}\}/g, subscriber.email);
}

export async function sendCampaignBatch(env: WorkerEnv, campaignId: string, batchStart: number, batchSize: number): Promise<void> {
  const campaign = await env.DB.prepare(`SELECT * FROM email_campaigns WHERE id = ?`).bind(campaignId).first<{
    id: string; brand_id: string; list_id: string; subject: string; from_name: string;
    from_email: string; reply_to: string | null; content_item_id: string | null;
  }>();
  if (!campaign) throw new Error('Campaign not found');

  // Get email body from content item
  let htmlBody = '';
  if (campaign.content_item_id) {
    const content = await env.DB.prepare(`SELECT body FROM content_items WHERE id = ?`).bind(campaign.content_item_id).first<{ body: string }>();
    htmlBody = content?.body ?? '';
    // Extract body from the SUBJECT/PREVIEW/--- format if present
    const bodyMatch = htmlBody.match(/---\n([\s\S]+)/);
    if (bodyMatch) htmlBody = bodyMatch[1].trim();
  }

  if (!htmlBody) throw new Error('Campaign has no email body');

  // Get subscriber batch
  const subscribers = await env.DB.prepare(
    `SELECT email, first_name FROM email_subscribers
     WHERE list_id = ? AND status = 'subscribed'
     LIMIT ? OFFSET ?`
  ).bind(campaign.list_id, batchSize, batchStart).all<{ email: string; first_name: string | null }>();

  const appUrl = env.APP_URL || '';
  let sent = 0;

  for (const sub of subscribers.results) {
    const unsubscribeToken = btoa(JSON.stringify({ email: sub.email, listId: campaign.list_id }));
    const unsubscribeUrl = `${appUrl}/api/email/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const personalizedHtml = injectUnsubscribeLink(personalizeContent(htmlBody, sub), unsubscribeUrl);
    const personalizedSubject = personalizeContent(campaign.subject, sub);

    const msgId = await sendEmail(env, {
      to: sub.email,
      fromName: campaign.from_name,
      fromEmail: campaign.from_email,
      replyTo: campaign.reply_to ?? undefined,
      subject: personalizedSubject,
      htmlBody: personalizedHtml,
    });

    if (msgId) sent++;
  }

  // Update campaign stats
  await env.DB.prepare(
    `UPDATE email_campaigns SET recipient_count = recipient_count + ?, sent_at = COALESCE(sent_at, unixepoch()) WHERE id = ?`
  ).bind(sent, campaignId).run();
}

export async function scheduleCampaignSend(env: WorkerEnv): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const campaigns = await env.DB.prepare(
    `SELECT ec.*, el.subscriber_count FROM email_campaigns ec
     JOIN email_lists el ON el.id = ec.list_id
     WHERE ec.status = 'scheduled' AND ec.scheduled_for <= ?`
  ).bind(now).all<{ id: string; subscriber_count: number }>();

  for (const campaign of campaigns.results) {
    await env.DB.prepare(`UPDATE email_campaigns SET status = 'sending' WHERE id = ?`).bind(campaign.id).run();

    const batchSize = 50;
    const total = campaign.subscriber_count || 0;
    for (let offset = 0; offset < Math.max(total, 1); offset += batchSize) {
      await env.EMAIL_DISPATCH_QUEUE.send({
        jobId: generateId(),
        jobType: 'send_email_batch',
        brandId: undefined,
        payload: { campaignId: campaign.id, batchStart: offset, batchSize },
      });
    }
  }
}
