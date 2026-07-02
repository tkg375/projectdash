import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { generateId } from '@/lib/crypto';
import { z } from 'zod';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const CampaignSchema = z.object({
  list_id: z.string(),
  subject: z.string().min(1).max(200),
  preview_text: z.string().optional(),
  from_name: z.string().min(1),
  from_email: z.string().email(),
  reply_to: z.string().email().optional(),
  content_item_id: z.string().optional(),
  scheduled_for: z.number().optional(),
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await getDb();
  const result = await db.prepare(
    `SELECT ec.*, el.name as list_name FROM email_campaigns ec
     JOIN email_lists el ON el.id = ec.list_id
     WHERE ec.brand_id = ? ORDER BY ec.created_at DESC`
  ).bind(brandId).all();
  return NextResponse.json(result.results);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await req.json() as unknown;
    const data = CampaignSchema.parse(body);
    const db = await getDb();
    const id = generateId();
    await db.prepare(
      `INSERT INTO email_campaigns (id, brand_id, list_id, subject, preview_text, from_name, from_email, reply_to, content_item_id, scheduled_for, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, brandId, data.list_id, data.subject, data.preview_text ?? null,
      data.from_name, data.from_email, data.reply_to ?? null,
      data.content_item_id ?? null, data.scheduled_for ?? null,
      data.scheduled_for ? 'scheduled' : 'draft'
    ).run();
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
