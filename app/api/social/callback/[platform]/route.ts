import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { encrypt, generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ platform: string }> }) {
  const { platform } = await params;
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  if (error) return NextResponse.redirect(new URL(`/social?error=${error}`, req.url));
  if (!code || !state) return NextResponse.redirect(new URL('/social?error=no_code', req.url));

  // Extract brandId from state
  let brandId = '';
  try {
    const decoded = JSON.parse(atob(state));
    brandId = decoded.brandId;
  } catch {
    return NextResponse.redirect(new URL('/social?error=invalid_state', req.url));
  }

  if (!brandId) return NextResponse.redirect(new URL('/social?error=invalid_state', req.url));

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
        const redirectUri = `${appUrl}/api/social/callback/linkedin`;

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
        const redirectUri = `${appUrl}/api/social/callback/facebook`;

        const tokenRes = await fetch(
          `https://graph.facebook.com/v22.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`
        );
        const tokenData = await tokenRes.json() as { access_token?: string; error?: { message: string } };
        if (!tokenRes.ok || !tokenData.access_token) {
          throw new Error(`Facebook token exchange failed: ${tokenData.error?.message ?? tokenRes.status}`);
        }

        // Exchange for long-lived token
        const llRes = await fetch(
          `https://graph.facebook.com/v22.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${tokenData.access_token}`
        );
        const llData = await llRes.json() as { access_token?: string; expires_in?: number; error?: { message: string } };
        if (!llData.access_token) {
          throw new Error(`Facebook long-lived token failed: ${llData.error?.message ?? 'unknown'}`);
        }
        accessToken = llData.access_token;
        expiresIn = llData.expires_in ?? 5183944;

        // Fetch ALL pages, following pagination cursors (Facebook paginates /me/accounts)
        type FbPage = { id: string; name: string; access_token: string };
        const allPages: FbPage[] = [];
        let nextUrl: string | null =
          `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token&limit=50&access_token=${accessToken}`;

        while (nextUrl) {
          const pagesRes = await fetch(nextUrl);
          const pagesData = await pagesRes.json() as {
            data?: FbPage[];
            error?: { message: string };
            paging?: { next?: string };
          };
          if (pagesData.error) throw new Error(`Pages fetch failed: ${pagesData.error.message}`);
          for (const p of pagesData.data ?? []) allPages.push(p);
          nextUrl = pagesData.paging?.next ?? null;
        }

        const pages = { data: allPages };

        if (!pages.data?.length) {
          // No pages — save user-level token and username instead
          const meRes = await fetch(`https://graph.facebook.com/v22.0/me?fields=id,name&access_token=${accessToken}`);
          const me = await meRes.json() as { id?: string; name?: string; error?: { message: string } };
          if (!me.id) throw new Error('No Facebook Pages found and user profile fetch failed');
          userId = me.id;
          username = me.name ?? 'Facebook User';
        } else if (pages.data.length === 1) {
          // Only one page — save it automatically
          userId = pages.data[0].id;
          username = pages.data[0].name;
          accessToken = pages.data[0].access_token;
        } else {
          // Multiple pages — store in KV and redirect to picker
          const kv = (env as unknown as { SESSION_KV: KVNamespace }).SESSION_KV;
          const pickKey = `fb_pages:${brandId}:${Date.now()}`;
          await kv.put(pickKey, JSON.stringify({
            brandId,
            expiresIn,
            userToken: accessToken,
            pages: pages.data.map(p => ({ id: p.id, name: p.name, access_token: p.access_token })),
          }), { expirationTtl: 3600 });
          return NextResponse.redirect(new URL(`/social?fb_pick=${encodeURIComponent(pickKey)}`, req.url));
        }
        break;
      }

      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }

    const encryptedToken = await encrypt(accessToken, (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY);
    const encryptedRefresh = refreshToken
      ? await encrypt(refreshToken, (env as unknown as { ENCRYPTION_KEY: string }).ENCRYPTION_KEY)
      : null;

    const resolvedPlatform = platform;
    await db.prepare(
      `INSERT INTO social_accounts (id, brand_id, platform, platform_user_id, platform_username, access_token, refresh_token, token_expires_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
       ON CONFLICT(brand_id, platform) DO UPDATE SET
         access_token = excluded.access_token, refresh_token = excluded.refresh_token,
         token_expires_at = excluded.token_expires_at, platform_username = excluded.platform_username,
         is_active = 1, last_error = NULL`
    ).bind(
      generateId(), brandId, resolvedPlatform, userId, username, encryptedToken,
      encryptedRefresh, Math.floor(Date.now() / 1000) + expiresIn
    ).run();

    return NextResponse.redirect(new URL('/social?connected=1', req.url));
  } catch (err) {
    console.error('OAuth callback error:', err);
    const msg = err instanceof Error ? encodeURIComponent(err.message.slice(0, 120)) : 'auth_failed';
    return NextResponse.redirect(new URL(`/social?error=${msg}`, req.url));
  }
}
