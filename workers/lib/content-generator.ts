import type { WorkerEnv, Brand, BrandSettings } from './types';
import { saveContent, updateContentStatus } from './db';
import { generateId } from './crypto';

function buildSystemPrompt(brand: Brand & BrandSettings): string {
  const voice = JSON.parse(brand.brand_voice || '{}');
  const audience = JSON.parse(brand.target_audience || '{}');
  const pillars = JSON.parse(brand.content_pillars || '[]');
  return `You are a marketing content writer for ${brand.name}.
Tone: ${voice.tone || 'professional'}
Personality: ${voice.personality || ''}
${voice.avoid?.length ? `Never use: ${voice.avoid.join(', ')}` : ''}
Industry: ${brand.industry || 'General'}
Target audience: ${audience.age_range || ''} ${audience.interests?.join(', ') || ''}
${pillars.length ? `Content pillars: ${pillars.join(', ')}` : ''}
${brand.website_url ? `Website URL: ${brand.website_url} — use this exact URL in content, never write placeholder text like [link] or [website].` : ''}
Write only the content — no meta-commentary or explanations. Never use placeholder text.
Never mention AI, artificial intelligence, Gemini, language models, or that this content was generated or written by software. Write as a human author.`;
}

async function callGemini(env: WorkerEnv, system: string, user: string): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { maxOutputTokens: 8192 },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
  const data = await res.json() as { candidates: Array<{ content: { parts: Array<{ text: string }> } }> };
  return data.candidates[0]?.content?.parts[0]?.text ?? '';
}

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

export async function generateBlogPost(env: WorkerEnv, brand: Brand & BrandSettings, keyword?: string, topic?: string, forceStatus?: 'scheduled' | 'draft'): Promise<string> {
  const system = buildSystemPrompt(brand);
  const pillars = JSON.parse(brand.content_pillars || '[]') as string[];
  const user = `Write a comprehensive, SEO-optimized blog post${keyword ? ` targeting the keyword: "${keyword}"` : ''}${topic ? ` about: ${topic}` : ''}.
${pillars.length ? `Stay within these content pillars: ${pillars.join(', ')}.` : ''}
The post must be genuinely educational and helpful to the reader — practical advice, real information, actionable takeaways.
Do NOT write promotional content, product pitches, or make the brand the subject. The brand can appear naturally in a brief CTA at the end only.
Format in clean HTML. Use <h1> for the title, <h2> for section headings, <p> for paragraphs.
IMPORTANT: Return ONLY the article content tags — start directly with <h1>. Do NOT include <!DOCTYPE>, <html>, <head>, <body>, or any wrapper tags. No markdown — no #, ##, **, *, or backtick characters. Aim for 1400-2000 words.`;

  const rawText = await callGemini(env, system, user);
  // Strip full HTML document wrapper if Gemini returns one
  const bodyMatch = rawText.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const text = bodyMatch ? bodyMatch[1].trim() : rawText.replace(/<!DOCTYPE[^>]*>|<html[^>]*>|<\/html>|<head>[\s\S]*?<\/head>|<body[^>]*>|<\/body>/gi, '').trim();
  const titleMatch = text.match(/<h1[^>]*>(.+?)<\/h1>/i);
  const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '') ?? null;

  // Blog posts live in D1 — publishing = marking published directly, no external CMS needed
  let status: string;
  let scheduledFor: number | undefined;
  let publishedAt: number | undefined;
  const nowSec = Math.floor(Date.now() / 1000);

  if (forceStatus === 'draft') {
    status = 'draft';
  } else if (forceStatus === 'scheduled') {
    // Treat as publish now
    status = 'published';
    publishedAt = nowSec;
  } else if (brand.auto_publish) {
    status = 'published';
    publishedAt = nowSec;
  } else {
    status = 'draft';
  }

  const id = await saveContent(env, {
    brandId: brand.id,
    contentType: 'blog',
    title: title ?? undefined,
    body: text,
    status,
    scheduledFor,
    publishedAt,
    aiModel: 'gemini-2.5-flash',
  });

  return id;
}

export async function generateSocialPosts(env: WorkerEnv, brand: Brand & BrandSettings, platform: string, count: number = 1, topic?: string, forceStatus?: 'scheduled' | 'draft'): Promise<string[]> {
  const system = buildSystemPrompt(brand);
  const platformGuide: Record<string, string> = {
    linkedin: 'Professional thought-leadership tone. 150-300 words. Start with a hook. End the post with 3-5 relevant hashtags on a new line.',
    facebook: 'Conversational, engaging. 100-250 words. Encourage interaction. End the post with 3-5 relevant hashtags on a new line.',
    bluesky: 'Concise, punchy. Max 300 characters. Conversational and authentic. No hashtag spam — 1-2 max.',
    mastodon: 'Thoughtful and community-oriented. Up to 500 chars. Relevant hashtags welcome (2-4).',
  };

  const user = `Write ${count} social media post(s) for ${platform.toUpperCase()}${topic ? ` about: ${topic}` : ` for ${brand.name}`}.
${platformGuide[platform] || ''}
Separate multiple posts with ---
Do not number them or add labels.
Write in plain text only — no markdown formatting, no asterisks for bold, no underscores for emphasis.
Hashtags should use the # character (e.g. #marketing #business).`;

  const text = await callGemini(env, system, user);
  const posts = count > 1 ? text.split(/\n---\n/).map(p => stripMarkdown(p)).filter(Boolean) : [stripMarkdown(text)];

  // Look up connected social account for this platform
  const { getActiveSocialAccounts } = await import('./db');
  const accounts = await getActiveSocialAccounts(env, brand.id);
  const account = accounts.find(a => a.platform === platform);
  const shouldSchedule = forceStatus === 'scheduled' || (!forceStatus && !!brand.auto_publish && !!account);

  const ids: string[] = [];
  for (const postBody of posts.slice(0, count)) {
    const id = await saveContent(env, {
      brandId: brand.id,
      contentType: 'social',
      platform,
      body: postBody,
      status: shouldSchedule && account ? 'scheduled' : 'draft',
      scheduledFor: shouldSchedule && account ? Math.floor(Date.now() / 1000) + 300 : undefined,
      socialAccountId: account?.id,
      aiModel: 'gemini-2.5-flash',
    });
    ids.push(id);
  }
  return ids;
}

export async function generateEmailNewsletter(env: WorkerEnv, brand: Brand & BrandSettings, topic?: string): Promise<string> {
  const system = buildSystemPrompt(brand);
  const user = `Write a marketing email newsletter for ${brand.name}${topic ? ` about: ${topic}` : ''}.
Return in this exact format:
SUBJECT: <subject line under 60 chars>
PREVIEW: <preview text under 90 chars>
---
<full email body in HTML — use simple inline styles, no external CSS>`;

  const text = await callGemini(env, system, user);
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const title = subjectMatch?.[1]?.trim() ?? `Newsletter from ${brand.name}`;

  const id = await saveContent(env, {
    brandId: brand.id,
    contentType: 'email',
    title,
    body: text,
    status: 'draft',
    aiModel: 'gemini-2.5-flash',
  });

  return id;
}

export async function runContentScheduler(env: WorkerEnv, brand: Brand & BrandSettings): Promise<void> {
  const cadence = JSON.parse(brand.content_cadence || '{}');
  const today = new Date().toISOString().slice(0, 10);

  // Start of the current ISO week (Monday)
  const now = new Date();
  const dayOfWeek = now.getUTCDay(); // 0 = Sunday
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(now);
  weekStart.setUTCDate(now.getUTCDate() - daysFromMonday);
  const weekStartStr = weekStart.toISOString().slice(0, 10);

  // Check what was already generated today (for social dedup)
  const existing = await env.DB.prepare(
    `SELECT content_type, platform, COUNT(*) as cnt
     FROM content_items
     WHERE brand_id = ? AND date(created_at, 'unixepoch') = ?
     GROUP BY content_type, platform`
  ).bind(brand.id, today).all<{ content_type: string; platform: string; cnt: number }>();

  const generated: Record<string, number> = {};
  for (const row of existing.results) {
    const key = `${row.content_type}:${row.platform ?? ''}`;
    generated[key] = row.cnt;
  }

  // Check how many blog posts were generated this week
  const blogThisWeek = await env.DB.prepare(
    `SELECT COUNT(*) as cnt FROM content_items
     WHERE brand_id = ? AND content_type = 'blog' AND date(created_at, 'unixepoch') >= ?`
  ).bind(brand.id, weekStartStr).first<{ cnt: number }>();
  const blogGeneratedThisWeek = blogThisWeek?.cnt ?? 0;

  const jobs: Array<{ type: string; platform?: string; count: number }> = [];

  // Blog posts — generate at most once per day, only if weekly target not yet met.
  // Default is 0 (disabled) so brands using content_schedules don't get double-generated.
  const blogTarget = cadence.blog_per_week ?? 0;
  if (blogTarget > 0 && blogGeneratedThisWeek < blogTarget && (generated['blog:'] ?? 0) === 0) {
    jobs.push({ type: 'blog', count: 1 });
  }

  // Social posts per platform — respects both daily cap and weekly cap if set
  const socialPerDay: number | null = cadence.social_per_day ?? null;
  const socialPerWeek: number | null = cadence.social_per_week ?? null;
  const { getActiveSocialAccounts } = await import('./db');
  const connectedAccounts = await getActiveSocialAccounts(env, brand.id);
  const connectedPlatforms = [...new Set(connectedAccounts.map(a => a.platform))];

  for (const platform of connectedPlatforms) {
    const generatedToday = generated[`social:${platform}`] ?? 0;

    // Daily cap check
    if (socialPerDay !== null && generatedToday >= socialPerDay) continue;

    // Weekly cap check
    if (socialPerWeek !== null) {
      const socialThisWeek = await env.DB.prepare(
        `SELECT COUNT(*) as cnt FROM content_items
         WHERE brand_id = ? AND content_type = 'social' AND platform = ? AND date(created_at, 'unixepoch') >= ?`
      ).bind(brand.id, platform, weekStartStr).first<{ cnt: number }>();
      const socialGeneratedThisWeek = socialThisWeek?.cnt ?? 0;
      if (socialGeneratedThisWeek >= socialPerWeek) continue;
    }

    // No limits set at all — skip
    if (socialPerDay === null && socialPerWeek === null) continue;

    const countToday = socialPerDay !== null ? socialPerDay - generatedToday : 1;
    jobs.push({ type: 'social', platform, count: countToday });
  }

  // Queue content generation jobs
  for (const job of jobs) {
    const jobId = generateId();
    const payload = {
      jobId,
      jobType: 'generate_content',
      brandId: brand.id,
      payload: { contentType: job.type, platform: job.platform, count: job.count },
    };
    await env.CONTENT_GENERATION_QUEUE.send(payload);
  }
}

export async function publishContentToCms(env: WorkerEnv, item: { id: string; brand_id: string; title: string | null; body: string; cms_connection_id: string }): Promise<void> {
  const conn = await env.DB.prepare(`SELECT * FROM cms_connections WHERE id = ?`).bind(item.cms_connection_id).first<{
    cms_type: string; endpoint_url: string; auth_type: string; auth_credentials: string;
  }>();
  if (!conn) throw new Error('CMS connection not found');

  const creds = JSON.parse(conn.auth_credentials);
  const now = Math.floor(Date.now() / 1000);

  if (conn.cms_type === 'wordpress') {
    const authHeader = conn.auth_type === 'basic'
      ? `Basic ${btoa(`${creds.username}:${creds.password}`)}`
      : `Bearer ${creds.token}`;

    const res = await fetch(`${conn.endpoint_url}/wp-json/wp/v2/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
      body: JSON.stringify({ title: item.title, content: item.body, status: 'publish' }),
    });

    if (!res.ok) throw new Error(`WordPress publish failed: ${res.status}`);
    const post = await res.json() as { id: number; link: string };
    await updateContentStatus(env, item.id, 'published', {
      published_at: now,
      external_id: String(post.id),
      external_url: post.link,
    });
  } else if (conn.cms_type === 'webhook') {
    const res = await fetch(conn.endpoint_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(creds.secret ? { 'X-Webhook-Secret': creds.secret } : {}),
      },
      body: JSON.stringify({ title: item.title, body: item.body, timestamp: now }),
    });
    if (!res.ok) throw new Error(`Webhook publish failed: ${res.status}`);
    await updateContentStatus(env, item.id, 'published', { published_at: now });
  }
}
