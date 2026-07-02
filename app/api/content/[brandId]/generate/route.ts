import { NextRequest, NextResponse } from 'next/server';
import { getDb, getEnv } from '@/lib/db';
import { generateId } from '@/lib/crypto';
import { z } from 'zod';
import { requireAuth, assertBrandOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const GenerateSchema = z.object({
  content_type: z.enum(['blog', 'social', 'email']),
  platform: z.string().optional(),
  topic: z.string().optional(),
  keyword: z.string().optional(),
  count: z.number().default(1),
  force_status: z.enum(['draft', 'scheduled']).optional(),
  scheduled_for: z.number().optional(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const user = await requireAuth();
  if (!await assertBrandOwner(user.id, brandId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const body = await req.json();
    const data = GenerateSchema.parse(body);
    const db = await getDb();
    const env = await getEnv();

    // Load brand voice
    const brand = await db.prepare(
      `SELECT b.*, bs.auto_publish FROM brands b LEFT JOIN brand_settings bs ON bs.brand_id = b.id WHERE b.id = ?`
    ).bind(brandId).first() as Record<string, unknown> | null;
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 });

    const brandVoice = JSON.parse(brand.brand_voice as string || '{}');

    // Build system prompt from brand voice
    const systemPrompt = `You are a marketing content writer for ${brand.name}.
Tone: ${brandVoice.tone || 'professional'}
Personality: ${brandVoice.personality || ''}
Avoid: ${(brandVoice.avoid || []).join(', ')}
Industry: ${brand.industry || ''}
Target audience: ${JSON.stringify(JSON.parse(brand.target_audience as string || '{}'))}
${brand.website_url ? `Website URL: ${brand.website_url} — use this exact URL in content, never use placeholder text like [link] or [website].` : ''}

Always write in the brand's voice and style. Return only the content, no explanations. Never use placeholder text — always use real values.
Never mention AI, artificial intelligence, language models, or that this content was generated or written by software. Write as a human author.`;

    // Build user prompt
    let userPrompt = '';
    if (data.content_type === 'blog') {
      const pillars = JSON.parse(brand.content_pillars as string || '[]') as string[];
      userPrompt = `Write a comprehensive, SEO-optimized blog post${data.keyword ? ` targeting the keyword: "${data.keyword}"` : ''}${data.topic ? ` about: ${data.topic}` : ''}.
${pillars.length ? `Stay within these content pillars: ${pillars.join(', ')}.` : ''}
The post must be genuinely educational and helpful to the reader — practical advice, real information, actionable takeaways.
Do NOT write promotional content, product pitches, or make the brand the subject. The brand can appear naturally in a brief CTA at the end only.
Format in clean HTML. Use <h1> for the title, <h2> for section headings, <p> for paragraphs.
IMPORTANT: Return ONLY the article content tags — start directly with <h1>. Do NOT include <!DOCTYPE>, <html>, <head>, <body>, or any wrapper tags. No markdown — no #, ##, **, *, or backtick characters. Aim for 1400-1800 words.`;
    } else if (data.content_type === 'social') {
      const platformGuides: Record<string, string> = {
        linkedin: 'Professional thought-leadership tone. 150-300 words. Start with a hook.',
        facebook: 'Conversational, engaging. 100-250 words. Encourage interaction. End the post with a new line containing 5-8 hashtags using the # symbol (e.g. #VetLife #PetCare #Telehealth).',
        bluesky: 'Concise, punchy. Max 300 characters. Conversational and authentic. Include 1-2 hashtags using the # symbol.',
        mastodon: 'Thoughtful and community-oriented. Up to 500 characters. Include 2-4 hashtags using the # symbol.',
      };
      userPrompt = `Write ${data.count} social media post(s) for ${data.platform || 'social media'}${data.topic ? ` about: ${data.topic}` : ''}.
${data.platform && platformGuides[data.platform] ? platformGuides[data.platform] : ''}
Separate multiple posts with ---
Write in plain text only — no asterisks for bold, no underscores for emphasis. Hashtags must use the # symbol (e.g. #Example).`;
    } else if (data.content_type === 'email') {
      userPrompt = `Write a marketing email newsletter${data.topic ? ` about: ${data.topic}` : ''}.
Include: subject line (prefix with "SUBJECT: "), preview text (prefix with "PREVIEW: "), and the full HTML email body.`;
    }

    // Call Cloudflare Workers AI
    const aiResult = await (env as unknown as { AI: Ai }).AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 8192,
    }) as { response?: string };
    const rawText = aiResult.response ?? '';
    // Strip full HTML document wrapper if model returns one for blog posts
    const generatedText = data.content_type === 'blog'
      ? (() => {
          const bodyMatch = rawText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
          return bodyMatch ? bodyMatch[1].trim() : rawText.replace(/<!DOCTYPE[^>]*>|<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>/gi, '').trim();
        })()
      : rawText;

    // Strip stray markdown from social posts
    function stripMarkdown(text: string): string {
      return text
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .trim();
    }

    // Extract title for blog posts
    let title: string | null = null;
    let contentBody = generatedText;
    if (data.content_type === 'blog') {
      const titleMatch = generatedText.match(/<h1[^>]*>(.+?)<\/h1>/i);
      if (titleMatch) title = titleMatch[1].replace(/<[^>]+>/g, '');
    } else if (data.content_type === 'social') {
      const posts = data.count > 1
        ? generatedText.split(/\n---\n/).map((p: string) => stripMarkdown(p)).filter(Boolean)
        : [stripMarkdown(generatedText)];
      contentBody = posts[0] ?? generatedText;
    }

    // Determine status and scheduling
    let status = 'draft';
    let scheduledFor: number | null = data.scheduled_for ?? null;
    let socialAccountId: string | null = null;

    // Look up social account if needed for posting
    if (data.content_type === 'social' && data.platform) {
      const account = await db.prepare(
        `SELECT id FROM social_accounts WHERE brand_id = ? AND platform = ? AND is_active = 1 LIMIT 1`
      ).bind(brandId, data.platform).first<{ id: string }>();
      if (account) socialAccountId = account.id;
    }

    const now = Math.floor(Date.now() / 1000);
    let publishedAt: number | null = null;

    if (data.force_status === 'scheduled') {
      // Manual schedule or post now — require social account for social posts
      if (data.content_type === 'social' && !socialAccountId) {
        return NextResponse.json({ error: `No connected ${data.platform} account for this brand. Connect one in the Social tab first.` }, { status: 400 });
      }
      if (data.content_type === 'blog') {
        // Blog posts live in D1 — publishing means marking published directly
        if (scheduledFor && scheduledFor > now) {
          // Future schedule: let the scheduler flip it to published at the right time
          status = 'scheduled';
        } else {
          status = 'published';
          publishedAt = now;
          scheduledFor = null;
        }
      } else {
        status = 'scheduled';
        if (!scheduledFor) scheduledFor = now + 10;
      }
    } else if (data.force_status === 'draft') {
      status = 'draft';
      scheduledFor = null;
      socialAccountId = null;
    } else if (brand.auto_publish) {
      // Fall back to auto_publish logic
      if (data.content_type === 'social' && socialAccountId) {
        status = 'scheduled';
        scheduledFor = now + 300;
      } else if (data.content_type === 'blog') {
        // Publish immediately — no external CMS needed
        status = 'published';
        publishedAt = now;
        scheduledFor = null;
      }
    }

    // Save to DB
    const id = generateId();
    await db.prepare(
      `INSERT INTO content_items (id, brand_id, content_type, platform, title, body, status, scheduled_for, published_at, social_account_id, ai_model)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'llama-3.3-70b')`
    ).bind(id, brandId, data.content_type, data.content_type === 'social' ? (data.platform ?? null) : null, title, contentBody, status, scheduledFor, publishedAt, socialAccountId).run();

    return NextResponse.json({ id, title, body: contentBody, status }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues }, { status: 400 });
    console.error(err);
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 });
  }
}
