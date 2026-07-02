import { NextRequest, NextResponse } from 'next/server';
import { getEnv } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 });

  const env = await getEnv();
  const kv = (env as unknown as { SESSION_KV: KVNamespace }).SESSION_KV;
  const raw = await kv.get(key);
  if (!raw) return NextResponse.json({ error: 'Session expired' }, { status: 404 });

  const { pages } = JSON.parse(raw) as { pages: Array<{ id: string; name: string }> };
  // Return only id + name, never the access_token
  return NextResponse.json({ pages: pages.map(p => ({ id: p.id, name: p.name })) });
}
