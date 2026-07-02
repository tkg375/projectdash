import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const brandSlug = searchParams.get('brand');

  if (!brandSlug) {
    return NextResponse.json({ error: 'brand parameter required' }, { status: 400 });
  }

  const db = await getDb();

  const brand = await db.prepare(
    `SELECT id FROM brands WHERE slug = ? OR LOWER(name) = LOWER(?)`
  ).bind(brandSlug, brandSlug).first<{ id: string }>();

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 });
  }

  const result = await db.prepare(
    `SELECT id, title, body, excerpt, metadata, published_at, created_at
     FROM content_items
     WHERE brand_id = ? AND content_type = 'blog' AND status = 'published'
     ORDER BY COALESCE(published_at, created_at) DESC`
  ).bind(brand.id).all<{
    id: string;
    title: string | null;
    body: string;
    excerpt: string | null;
    metadata: string;
    published_at: number | null;
    created_at: number;
  }>();

  const posts = result.results.map(row => {
    const meta = JSON.parse(row.metadata || '{}') as Record<string, string>;
    const title = row.title ?? meta.title ?? 'Untitled';
    const slug = meta.slug || slugify(title) || row.id;
    const date = row.published_at
      ? new Date(row.published_at * 1000).toISOString().slice(0, 10)
      : new Date(row.created_at * 1000).toISOString().slice(0, 10);

    // Estimate read time (~200 wpm)
    const wordCount = row.body.split(/\s+/).length;
    const readTime = `${Math.max(1, Math.round(wordCount / 200))} min read`;

    // Extract excerpt if not stored — strip HTML tags first
    const excerpt = row.excerpt || row.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160) + '…';

    return {
      id: row.id,
      slug,
      title,
      excerpt,
      body: row.body,
      date,
      readTime,
      category: meta.category || 'Blog',
    };
  });

  return NextResponse.json(
    { posts },
    {
      headers: {
        'Access-Control-Allow-Origin': 'https://www.docuanalyzer.com',
        'Cache-Control': 's-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
