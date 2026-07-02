import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { decrypt } from '@/lib/crypto';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const db = await getDb();
  const env = await getEnv();
  const encKey = (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY;

  const account = await db.prepare(
    `SELECT * FROM social_accounts WHERE brand_id = ? AND platform = 'facebook' AND is_active = 1 LIMIT 1`
  ).bind(brandId).first<{ id: string; access_token: string; platform_user_id: string; platform_username: string }>();

  if (!account) return NextResponse.json({ error: 'No active Facebook account' }, { status: 404 });

  let token = '';
  let decryptOk = false;
  try {
    token = await decrypt(account.access_token, encKey);
    decryptOk = true;
  } catch (e) {
    return NextResponse.json({ error: 'Decryption failed', detail: String(e) });
  }

  // Facebook
  const meRes = await fetch(`https://graph.facebook.com/v22.0/me?access_token=${token}&fields=id,name`);
  const meData = await meRes.json();

  const pageRes = await fetch(`https://graph.facebook.com/v22.0/${account.platform_user_id}?access_token=${token}&fields=id,name,fan_count`);
  const pageData = await pageRes.json();

  const postRes = await fetch(`https://graph.facebook.com/v22.0/${account.platform_user_id}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '[Test] Connectivity check — delete this post.', access_token: token }),
  });
  const postData = await postRes.json();

  return NextResponse.json({
    decryptOk,
    tokenPreview: token.slice(0, 20) + '...',
    tokenLength: token.length,
    accountId: account.id,
    pageId: account.platform_user_id,
    pageName: account.platform_username,
    fbMe: meData,
    fbPage: pageData,
    fbPostTest: postData,
  });
}
