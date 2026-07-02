import { NextRequest, NextResponse } from 'next/server';
import { destroySession, getSessionToken, clearCookieOptions } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(_request: NextRequest) {
  const token = await getSessionToken();
  if (token) await destroySession(token);
  const response = NextResponse.json({ success: true });
  response.cookies.set(clearCookieOptions());
  return response;
}
