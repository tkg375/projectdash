import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createUser, hashPassword } from '@/lib/auth';
import { createSession, sessionCookieOptions } from '@/lib/session';
import { generateId } from '@/lib/crypto';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json() as { email: string; password: string; name: string };

    if (!email || !password || !name) {
      return NextResponse.json({ error: 'Name, email, and password are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }

    const id = generateId();
    const passwordHash = await hashPassword(password);
    await createUser(id, email, name, passwordHash);

    const ip = request.headers.get('cf-connecting-ip') ?? undefined;
    const userAgent = request.headers.get('user-agent') ?? undefined;
    const token = await createSession(id, ip, userAgent);

    const response = NextResponse.json({ success: true }, { status: 201 });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch (err) {
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
