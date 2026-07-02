import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

// AWS SES sends SNS notifications for bounces, complaints, deliveries
export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { Type?: string; Message?: string; SubscribeURL?: string };

    // Handle SNS subscription confirmation
    if (body.Type === 'SubscriptionConfirmation' && body.SubscribeURL) {
      await fetch(body.SubscribeURL);
      return NextResponse.json({ ok: true });
    }

    if (body.Type !== 'Notification' || !body.Message) {
      return NextResponse.json({ ok: true });
    }

    const msg = JSON.parse(body.Message) as {
      notificationType?: string;
      bounce?: { bouncedRecipients: Array<{ emailAddress: string }> };
      complaint?: { complainedRecipients: Array<{ emailAddress: string }> };
    };

    const db = await getDb();

    if (msg.notificationType === 'Bounce' && msg.bounce) {
      for (const recipient of msg.bounce.bouncedRecipients) {
        await db.prepare(
          `UPDATE email_subscribers SET status = 'bounced' WHERE email = ?`
        ).bind(recipient.emailAddress.toLowerCase()).run();
      }
    }

    if (msg.notificationType === 'Complaint' && msg.complaint) {
      for (const recipient of msg.complaint.complainedRecipients) {
        await db.prepare(
          `UPDATE email_subscribers SET status = 'complained' WHERE email = ?`
        ).bind(recipient.emailAddress.toLowerCase()).run();
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('SES webhook error:', err);
    return NextResponse.json({ ok: true }); // Always return 200 to SES
  }
}
