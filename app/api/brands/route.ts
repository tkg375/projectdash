import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { generateId } from '@/lib/crypto';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateBrandSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  website_url: z.string().url().optional(),
  industry: z.string().optional(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#000000'),
  timezone: z.string().default('America/New_York'),
  brand_voice: z.object({
    tone: z.string().default('professional'),
    personality: z.string().default(''),
    avoid: z.array(z.string()).default([]),
    examples: z.array(z.string()).default([]),
  }).default({ tone: 'professional', personality: '', avoid: [], examples: [] }),
  target_audience: z.object({
    age_range: z.string().default(''),
    interests: z.array(z.string()).default([]),
    locations: z.array(z.string()).default([]),
  }).default({ age_range: '', interests: [], locations: [] }),
  content_cadence: z.object({
    blog_per_week: z.number().default(2),
    social_per_day: z.number().default(2),
    email_per_month: z.number().default(2),
  }).default({ blog_per_week: 2, social_per_day: 2, email_per_month: 2 }),
  content_pillars: z.array(z.string()).default([]),
});

export async function GET() {
  const user = await requireAuth();
  const db = await getDb();
  const brands = await db.prepare(
    `SELECT b.*, bs.content_cadence, bs.content_pillars, bs.auto_publish
     FROM brands b
     LEFT JOIN brand_settings bs ON bs.brand_id = b.id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`
  ).bind(user.id).all();
  return NextResponse.json(brands.results);
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json();
    const data = CreateBrandSchema.parse(body);
    const db = await getDb();

    const id = generateId();
    await db.prepare(
      `INSERT INTO brands (id, user_id, name, slug, website_url, industry, primary_color, timezone, brand_voice, target_audience)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      user.id,
      data.name,
      data.slug,
      data.website_url ?? null,
      data.industry ?? null,
      data.primary_color,
      data.timezone,
      JSON.stringify(data.brand_voice),
      JSON.stringify(data.target_audience)
    ).run();

    await db.prepare(
      `INSERT INTO brand_settings (brand_id, content_cadence, content_pillars)
       VALUES (?, ?, ?)`
    ).bind(id, JSON.stringify(data.content_cadence), JSON.stringify(data.content_pillars)).run();

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
