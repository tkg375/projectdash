export interface WorkerEnv {
  DB: D1Database;
  MEDIA_BUCKET: R2Bucket;
  SESSION_KV: KVNamespace;
  CONTENT_GENERATION_QUEUE: Queue;
  CONTENT_PUBLISHING_QUEUE: Queue;
  SOCIAL_POSTING_QUEUE: Queue;
  ANALYTICS_SYNC_QUEUE: Queue;
  EMAIL_DISPATCH_QUEUE: Queue;
  SEO_TASKS_QUEUE: Queue;
  ENVIRONMENT: string;
  APP_URL: string;
  OWNER_EMAIL: string;
  OWNER_PASSWORD_HASH: string;
  SESSION_SECRET: string;
  ENCRYPTION_KEY: string;
  AI: Ai;
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_SES_REGION: string;
  TWITTER_CLIENT_ID: string;
  TWITTER_CLIENT_SECRET: string;
  LINKEDIN_CLIENT_ID: string;
  LINKEDIN_CLIENT_SECRET: string;
  FACEBOOK_APP_ID: string;
  FACEBOOK_APP_SECRET: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  SERPER_API_KEY: string;
  KLING_API_KEY: string;
}

export type QueueJobType =
  | 'generate_content'
  | 'publish_content'
  | 'post_social'
  | 'sync_analytics'
  | 'send_email_batch'
  | 'seo_rank_check'
  | 'seo_generate_article';

export interface QueueMessage {
  jobId: string;
  jobType: QueueJobType;
  brandId?: string;
  payload: Record<string, unknown>;
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
  website_url: string | null;
  industry: string | null;
  brand_voice: string;
  target_audience: string;
  primary_color: string;
  timezone: string;
  is_active: number;
}

export interface BrandSettings {
  brand_id: string;
  content_cadence: string;
  content_pillars: string;
  auto_publish: number;
  language: string;
}

export interface SocialAccount {
  id: string;
  brand_id: string;
  platform: string;
  platform_user_id: string;
  platform_username: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number | null;
  is_active: number;
}

export interface ContentItem {
  id: string;
  brand_id: string;
  content_type: string;
  platform: string | null;
  title: string | null;
  body: string;
  status: string;
  scheduled_for: number | null;
  cms_connection_id: string | null;
  social_account_id: string | null;
}

export interface EmailCampaign {
  id: string;
  brand_id: string;
  list_id: string;
  content_item_id: string | null;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  status: string;
  scheduled_for: number | null;
}
