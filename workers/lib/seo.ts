import type { WorkerEnv, Brand, BrandSettings } from './types';
import { getKeywordsForRankCheck, saveKeywordRanking, saveContent } from './db';
import { generateId } from './crypto';

// ── Rank Checking via Serper.dev ──────────────────────────────────────────────

export async function checkKeywordRankings(env: WorkerEnv, brandId: string, websiteUrl: string): Promise<void> {
  const keywords = await getKeywordsForRankCheck(env, brandId);
  if (keywords.length === 0) return;

  // Process in batches of 5 to respect rate limits
  for (let i = 0; i < keywords.length; i += 5) {
    const batch = keywords.slice(i, i + 5);
    await Promise.all(batch.map(kw => checkSingleKeyword(env, kw, websiteUrl)));
  }
}

async function checkSingleKeyword(env: WorkerEnv, keyword: { id: string; keyword: string }, websiteUrl: string): Promise<void> {
  if (!env.SERPER_API_KEY) return;

  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: keyword.keyword, num: 100 }),
    });

    if (!res.ok) return;
    const data = await res.json() as { organic: Array<{ link: string; position: number }> };

    // Find position of website in results
    const domain = websiteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    let rank: number | null = null;
    let url: string | undefined;

    for (const result of data.organic || []) {
      if (result.link.includes(domain)) {
        rank = result.position;
        url = result.link;
        break;
      }
    }

    await saveKeywordRanking(env, keyword.id, rank, url);
  } catch {
    // Silently fail individual keyword checks
  }
}

// ── SEO Article Generation ────────────────────────────────────────────────────

export async function generateSeoArticle(env: WorkerEnv, brand: Brand & BrandSettings, keyword: string): Promise<string> {
  // Research phase: get top results for context
  let competitorContext = '';
  if (env.SERPER_API_KEY) {
    try {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: keyword, num: 5 }),
      });
      if (res.ok) {
        const data = await res.json() as { organic: Array<{ title: string; snippet: string }> };
        const snippets = (data.organic || []).slice(0, 5).map(r => `- ${r.title}: ${r.snippet}`).join('\n');
        competitorContext = `\n\nTop ranking content covers:\n${snippets}`;
      }
    } catch { /* skip */ }
  }

  const voice = JSON.parse(brand.brand_voice || '{}');
  const system = `You are an expert SEO content writer for ${brand.name}.
Tone: ${voice.tone || 'professional'}. Industry: ${brand.industry || 'General'}.
Write comprehensive, original content that genuinely helps readers and ranks well.
Never mention AI, artificial intelligence, language models, or that this content was generated or written by software. Write as a human author.`;

  const user = `Write a complete, SEO-optimized article targeting the keyword: "${keyword}"${competitorContext}

Requirements:
- Include the target keyword naturally in: H1 title, first paragraph, 2-3 H2 headings, conclusion
- Include 3-5 related LSI keywords throughout
- Structure: H1 title, intro paragraph, 5-7 H2 sections with detailed content, FAQ section, conclusion
- Length: 1800-2500 words
- Format in Markdown
- Genuinely comprehensive and helpful — not just keyword stuffing`;

  const aiResult = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 8192,
  }) as { response?: string };
  const text = aiResult.response ?? '';

  const titleMatch = text.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? keyword;

  const id = await saveContent(env, {
    brandId: brand.id,
    contentType: 'blog',
    title,
    body: text,
    status: brand.auto_publish ? 'scheduled' : 'draft',
    scheduledFor: brand.auto_publish ? Math.floor(Date.now() / 1000) + 600 : undefined,
    aiModel: 'llama-3.3-70b',
  });

  // Mark keyword as targeted
  await env.DB.prepare(
    `UPDATE seo_keywords SET is_auto_target = 0, last_checked_at = unixepoch() WHERE brand_id = ? AND keyword = ?`
  ).bind(brand.id, keyword).run();

  return id;
}

// ── Queue SEO Jobs ────────────────────────────────────────────────────────────

export async function queueSeoJobs(env: WorkerEnv, brand: Brand & BrandSettings): Promise<void> {
  // 1. Rank checks for all tracked keywords
  const keywords = await getKeywordsForRankCheck(env, brand.id);
  for (const kw of keywords) {
    await env.SEO_TASKS_QUEUE.send({
      jobId: generateId(),
      jobType: 'seo_rank_check',
      brandId: brand.id,
      payload: { keywordId: kw.id, keyword: kw.keyword, websiteUrl: brand.website_url ?? '' },
    });
  }

  // 2. Auto-generate articles for keywords that need ranking improvement
  const targets = await env.DB.prepare(
    `SELECT keyword FROM seo_keywords
     WHERE brand_id = ? AND is_tracking = 1 AND is_auto_target = 1
     AND (current_rank IS NULL OR current_rank > target_rank)
     LIMIT 3`
  ).bind(brand.id).all<{ keyword: string }>();

  for (const kw of targets.results) {
    await env.SEO_TASKS_QUEUE.send({
      jobId: generateId(),
      jobType: 'seo_generate_article',
      brandId: brand.id,
      payload: { keyword: kw.keyword },
    });
  }
}
