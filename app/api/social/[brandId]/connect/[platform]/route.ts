import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SCOPES: Record<string, string> = {
  linkedin: 'openid profile w_member_social',
  facebook: 'pages_manage_posts pages_read_engagement pages_show_list',
};

export async function GET(req: NextRequest, { params }: { params: Promise<{ brandId: string; platform: string }> }) {
  const { brandId, platform } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const env = await getEnv();
  const appUrl = (env as unknown as { APP_URL?: string }).APP_URL || req.nextUrl.origin;
  const state = btoa(JSON.stringify({ brandId, platform, ts: Date.now() }));

  let authUrl = '';

  switch (platform) {
    case 'linkedin': {
      const clientId = (env as unknown as { LINKEDIN_CLIENT_ID: string }).LINKEDIN_CLIENT_ID;
      if (!clientId) return NextResponse.redirect(`${appUrl}/social?error=LinkedIn+OAuth+credentials+not+configured`);
      const linkedinRedirect = `${appUrl}/api/social/callback/linkedin`;
      const linkedinParams = new URLSearchParams({
        response_type: 'code', client_id: clientId, redirect_uri: linkedinRedirect,
        scope: SCOPES.linkedin, state,
      });
      authUrl = `https://www.linkedin.com/oauth/v2/authorization?${linkedinParams}`;
      break;
    }

    case 'facebook': {
      const appId = (env as unknown as { FACEBOOK_APP_ID: string }).FACEBOOK_APP_ID;
      if (!appId) return NextResponse.redirect(`${appUrl}/social?error=Facebook+OAuth+credentials+not+configured`);
      const fbRedirect = `${appUrl}/api/social/callback/facebook`;
      const fbParams = new URLSearchParams({
        client_id: appId, redirect_uri: fbRedirect,
        scope: SCOPES.facebook, state, response_type: 'code',
      });
      authUrl = `https://www.facebook.com/v22.0/dialog/oauth?${fbParams}`;
      break;
    }

    default:
      return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 });
  }

  return NextResponse.redirect(authUrl);
}

