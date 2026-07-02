import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { encrypt, generateId } from '@/lib/crypto';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ brandId: string; platform: string }> }) {
  const { brandId, platform } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) return NextResponse.redirect(new URL(`/social?error=${error}`, req.url));
  if (!code) return NextResponse.redirect(new URL('/social?error=no_code', req.url));

  const env = await getEnv();
  const appUrl = (env as unknown as { APP_URL?: string }).APP_URL || req.nextUrl.origin;
  const db = await getDb();

  try {
    let accessToken = '';
    let refreshToken: string | null = null;
    let expiresIn = 7200;
    let userId = '';
    let username = '';

    switch (platform) {
      case 'linkedin': {
        const clientId = (env as unknown as { LINKEDIN_CLIENT_ID: string }).LINKEDIN_CLIENT_ID;
        const clientSecret = (env as unknown as { LINKEDIN_CLIENT_SECRET: string }).LINKEDIN_CLIENT_SECRET;
        const redirectUri = `${appUrl}/api/social/${brandId}/callback/linkedin`;

        const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: clientId, client_secret: clientSecret }),
        });
        if (!tokenRes.ok) throw new Error(`LinkedIn token exchange failed: ${tokenRes.status}`);
        const tokenData = await tokenRes.json() as { access_token: string; expires_in: number };
        accessToken = tokenData.access_token;
        expiresIn = tokenData.expires_in;

        const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const me = await meRes.json() as { sub: string; name: string };
        userId = me.sub;
        username = me.name;
        break;
      }

      case 'facebook': {
        const appId = (env as unknown as { FACEBOOK_APP_ID: string }).FACEBOOK_APP_ID;
        const appSecret = (env as unknown as { FACEBOOK_APP_SECRET: string }).FACEBOOK_APP_SECRET;
        const redirectUri = `${appUrl}/api/social/${brandId}/callback/facebook`;

        const tokenRes = await fetch(
          `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
        );
        if (!tokenRes.ok) throw new Error(`Facebook token exchange failed: ${tokenRes.status}`);
        const tokenData = await tokenRes.json() as { access_token: string; expires_in?: number };
        // Exchange for long-lived token
        const llRes = await fetch(
          `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
        );
        const llData = await llRes.json() as { access_token: string; expires_in?: number };
        accessToken = llData.access_token;
        expiresIn = llData.expires_in ?? 5183944; // ~60 days

        // Get pages
        const pagesRes = await fetch(`https://graph.facebook.com/v22.0/me/accounts?access_token=${accessToken}`);
        const pages = await pagesRes.json() as { data: Array<{ id: string; name: string; access_token: string }> };
        userId = pages.data?.[0]?.id ?? '';
        username = pages.data?.[0]?.name ?? '';
        // Use page token for posting
        if (pages.data?.[0]?.access_token) accessToken = pages.data[0].access_token;
        break;
      }

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const encryptedToken = await encrypt(accessToken, (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY);
    const encryptedRefresh = refreshToken
      ? await encrypt(refreshToken, (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY)
      : null;

    await db.prepare(
      `INSERT INTO social_accounts (id, brand_id, platform, platform_user_id, platform_username, access_token, refresh_token, token_expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(brand_id, platform) DO UPDATE SET
         access_token = excluded.access_token, refresh_token = excluded.refresh_token,
         token_expires_at = excluded.token_expires_at, platform_username = excluded.platform_username,
         is_active = 1, last_error = NULL`
    ).bind(
      generateId(), brandId, platform, userId, username, encryptedToken,
      encryptedRefresh, Math.floor(Date.now() / 1000) + expiresIn
    ).run();

    return NextResponse.redirect(new URL('/social?connected=1', req.url));
  } catch (err) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/social?error=auth_failed', req.url));
  }
}
