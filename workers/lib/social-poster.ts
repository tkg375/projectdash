import type { WorkerEnv, SocialAccount } from './types';
import { decrypt } from './crypto';
import { updateContentStatus } from './db';

async function decryptToken(token: string, env: WorkerEnv): Promise<string> {
  try { return await decrypt(token, env.ENCRYPTION_KEY); } catch { return token; }
}

// ── LinkedIn ─────────────────────────────────────────────────────────────────

export async function postToLinkedIn(env: WorkerEnv, account: SocialAccount, text: string, contentItemId: string): Promise<void> {
  const token = await decryptToken(account.access_token, env);

  // Get user URN first if not stored
  const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!meRes.ok) throw new Error(`LinkedIn auth check failed: ${meRes.status}`);
  const me = await meRes.json() as { sub: string };

  const body = {
    author: `urn:li:person:${account.platform_user_id || me.sub}`,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'X-Restli-Protocol-Version': '2.0.0' },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`LinkedIn post failed: ${res.status} ${await res.text()}`);
  const postId = res.headers.get('x-restli-id') ?? '';
  await finalizeSocialPost(env, contentItemId, account, postId, `https://www.linkedin.com/feed/update/${postId}/`);
}

// ── Facebook ─────────────────────────────────────────────────────────────────

export async function postToFacebook(env: WorkerEnv, account: SocialAccount, text: string, contentItemId: string): Promise<void> {
  const token = await decryptToken(account.access_token, env);
  const pageId = account.platform_user_id;

  const res = await fetch(`https://graph.facebook.com/v22.0/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text, access_token: token }),
  });

  if (!res.ok) throw new Error(`Facebook post failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string };
  await finalizeSocialPost(env, contentItemId, account, data.id, `https://www.facebook.com/${data.id}`);
}

// ── Bluesky ───────────────────────────────────────────────────────────────────

export async function postToBluesky(env: WorkerEnv, account: SocialAccount, text: string, contentItemId: string): Promise<void> {
  // access_token stores "handle::appPassword" encrypted
  const raw = await decryptToken(account.access_token, env);
  const [identifier, password] = raw.split('::');
  if (!identifier || !password) throw new Error('Bluesky credentials malformed');

  // Create session (get accessJwt + DID)
  const sessionRes = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!sessionRes.ok) throw new Error(`Bluesky auth failed: ${sessionRes.status} ${await sessionRes.text()}`);
  const session = await sessionRes.json() as { accessJwt: string; did: string };

  // Enforce 300-char limit
  const post = text.length > 300 ? text.slice(0, 297) + '…' : text;

  const record = {
    $type: 'app.bsky.feed.post',
    text: post,
    createdAt: new Date().toISOString(),
  };

  const res = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.accessJwt}` },
    body: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record }),
  });

  if (!res.ok) throw new Error(`Bluesky post failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { uri: string; cid: string };
  // Convert at:// URI to bsky.app URL
  const parts = data.uri.replace('at://', '').split('/');
  const postUrl = `https://bsky.app/profile/${parts[0]}/post/${parts[2]}`;
  await finalizeSocialPost(env, contentItemId, account, data.cid, postUrl);
}

// ── Mastodon ──────────────────────────────────────────────────────────────────

export async function postToMastodon(env: WorkerEnv, account: SocialAccount, text: string, contentItemId: string): Promise<void> {
  // access_token stores "instanceUrl::accessToken" encrypted
  const raw = await decryptToken(account.access_token, env);
  const sep = raw.indexOf('::');
  if (sep === -1) throw new Error('Mastodon credentials malformed');
  const instanceUrl = raw.slice(0, sep).replace(/\/$/, '');
  const token = raw.slice(sep + 2);

  // Enforce 500-char limit (Mastodon default)
  const status = text.length > 500 ? text.slice(0, 497) + '…' : text;

  const res = await fetch(`${instanceUrl}/api/v1/statuses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ status, visibility: 'public' }),
  });

  if (!res.ok) throw new Error(`Mastodon post failed: ${res.status} ${await res.text()}`);
  const data = await res.json() as { id: string; url: string };
  await finalizeSocialPost(env, contentItemId, account, data.id, data.url);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export async function dispatchSocialPost(env: WorkerEnv, contentItemId: string, accountId: string): Promise<void> {
  const item = await env.DB.prepare(`SELECT * FROM content_items WHERE id = ?`).bind(contentItemId).first<{
    id: string; body: string; platform: string; brand_id: string;
  }>();
  if (!item) throw new Error('Content item not found');

  const account = await env.DB.prepare(`SELECT * FROM social_accounts WHERE id = ?`).bind(accountId).first<SocialAccount>();
  if (!account) throw new Error('Social account not found');

  switch (account.platform) {
    case 'linkedin': return postToLinkedIn(env, account, item.body, contentItemId);
    case 'facebook': return postToFacebook(env, account, item.body, contentItemId);
    case 'bluesky': return postToBluesky(env, account, item.body, contentItemId);
    case 'mastodon': return postToMastodon(env, account, item.body, contentItemId);
    default: throw new Error(`Unsupported platform: ${account.platform}`);
  }
}

async function finalizeSocialPost(env: WorkerEnv, contentItemId: string, account: SocialAccount, externalId: string, externalUrl: string): Promise<void> {
  await updateContentStatus(env, contentItemId, 'published', {
    published_at: Math.floor(Date.now() / 1000),
    external_id: externalId,
    external_url: externalUrl,
  });
  // Update social account last error to null on success
  await env.DB.prepare(`UPDATE social_accounts SET last_error = NULL WHERE id = ?`).bind(account.id).run();
}
