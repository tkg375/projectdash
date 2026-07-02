import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const token = searchParams.get('token');
  if (!token) return new NextResponse('Invalid unsubscribe link', { status: 400 });

  try {
    const { email, listId } = JSON.parse(atob(token)) as { email: string; listId: string };
    const db = await getDb();
    await db.prepare(
      `UPDATE email_subscribers SET status = 'unsubscribed', unsubscribed_at = unixepoch()
       WHERE email = ? AND list_id = ?`
    ).bind(email.toLowerCase(), listId).run();
    return new NextResponse(`
      <html><body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center">
        <h2>Unsubscribed</h2>
        <p>You've been successfully unsubscribed.</p>
      </body></html>
    `, { headers: { 'Content-Type': 'text/html' } });
  } catch {
    return new NextResponse('Invalid unsubscribe link', { status: 400 });
  }
}
