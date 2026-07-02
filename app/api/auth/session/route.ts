import { NextRequest, NextResponse } from 'next/server';
import { validateSession, getSessionToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const token = await getSessionToken();
  if (!token) return NextResponse.json({ authenticated: false });
  const user = await validateSession(token);
  if (!user) return NextResponse.json({ authenticated: false });
  return NextResponse.json({ authenticated: true, user });
}
