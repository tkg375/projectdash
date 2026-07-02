import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get('brandId');
  const status = searchParams.get('status');
  const limit = parseInt(searchParams.get('limit') ?? '100');

  const db = await getDb();
  let query = `SELECT * FROM job_logs WHERE 1=1`;
  const bindings: unknown[] = [];

  if (brandId) { query += ` AND brand_id = ?`; bindings.push(brandId); }
  if (status) { query += ` AND status = ?`; bindings.push(status); }
  query += ` ORDER BY created_at DESC LIMIT ?`;
  bindings.push(limit);

  const results = await db.prepare(query).bind(...bindings).all();
  return NextResponse.json(results.results);
}
