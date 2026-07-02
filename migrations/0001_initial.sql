-- Project Dash: Initial Schema

-- ============================================================
-- OWNER / AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS owner (
  id            TEXT PRIMARY KEY DEFAULT 'owner',
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL DEFAULT 'owner',
  expires_at INTEGER NOT NULL,
  ip         TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- BRANDS
-- ============================================================

CREATE TABLE IF NOT EXISTS brands (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  logo_r2_key     TEXT,
  website_url     TEXT,
  industry        TEXT,
  target_audience TEXT NOT NULL DEFAULT '{}',
  brand_voice     TEXT NOT NULL DEFAULT '{}',
  primary_color   TEXT NOT NULL DEFAULT '#000000',
  timezone        TEXT NOT NULL DEFAULT 'America/New_York',
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS brand_settings (
  brand_id        TEXT PRIMARY KEY REFERENCES brands(id) ON DELETE CASCADE,
  content_cadence TEXT NOT NULL DEFAULT '{"blog_per_week":2,"social_per_day":2,"email_per_month":2}',
  content_pillars TEXT NOT NULL DEFAULT '[]',
  auto_publish    INTEGER NOT NULL DEFAULT 0,
  language        TEXT NOT NULL DEFAULT 'en',
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- SOCIAL ACCOUNTS
-- ============================================================

CREATE TABLE IF NOT EXISTS social_accounts (
  id                TEXT PRIMARY KEY,
  brand_id          TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform          TEXT NOT NULL,
  platform_user_id  TEXT NOT NULL,
  platform_username TEXT,
  access_token      TEXT NOT NULL,
  refresh_token     TEXT,
  token_expires_at  INTEGER,
  scopes            TEXT DEFAULT '[]',
  is_active         INTEGER NOT NULL DEFAULT 1,
  last_error        TEXT,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(brand_id, platform)
);

-- ============================================================
-- CMS CONNECTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS cms_connections (
  id               TEXT PRIMARY KEY,
  brand_id         TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  cms_type         TEXT NOT NULL,
  endpoint_url     TEXT NOT NULL,
  auth_type        TEXT NOT NULL,
  auth_credentials TEXT NOT NULL,
  default_category TEXT,
  auto_publish     INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  last_sync_at     INTEGER,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- CONTENT
-- ============================================================

CREATE TABLE IF NOT EXISTS content_items (
  id                TEXT PRIMARY KEY,
  brand_id          TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  content_type      TEXT NOT NULL,
  platform          TEXT,
  title             TEXT,
  body              TEXT NOT NULL,
  excerpt           TEXT,
  metadata          TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'draft',
  ai_model          TEXT,
  generation_cost   REAL,
  scheduled_for     INTEGER,
  published_at      INTEGER,
  external_id       TEXT,
  external_url      TEXT,
  cms_connection_id TEXT REFERENCES cms_connections(id),
  social_account_id TEXT REFERENCES social_accounts(id),
  created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_content_brand_status ON content_items(brand_id, status);
CREATE INDEX IF NOT EXISTS idx_content_scheduled ON content_items(scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_content_type ON content_items(brand_id, content_type);

CREATE TABLE IF NOT EXISTS media_assets (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  r2_key          TEXT NOT NULL UNIQUE,
  filename        TEXT NOT NULL,
  mime_type       TEXT NOT NULL,
  file_size_bytes INTEGER,
  width           INTEGER,
  height          INTEGER,
  alt_text        TEXT,
  tags            TEXT DEFAULT '[]',
  source          TEXT DEFAULT 'upload',
  content_item_id TEXT REFERENCES content_items(id),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- SEO
-- ============================================================

CREATE TABLE IF NOT EXISTS seo_keywords (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  keyword         TEXT NOT NULL,
  search_volume   INTEGER,
  difficulty      INTEGER,
  current_rank    INTEGER,
  target_rank     INTEGER DEFAULT 10,
  intent          TEXT DEFAULT 'informational',
  is_tracking     INTEGER NOT NULL DEFAULT 1,
  is_auto_target  INTEGER NOT NULL DEFAULT 1,
  last_checked_at INTEGER,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(brand_id, keyword)
);

CREATE TABLE IF NOT EXISTS keyword_rankings (
  id          TEXT PRIMARY KEY,
  keyword_id  TEXT NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
  rank        INTEGER,
  url         TEXT,
  recorded_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_keyword_rankings ON keyword_rankings(keyword_id, recorded_at);

-- ============================================================
-- ANALYTICS
-- ============================================================

CREATE TABLE IF NOT EXISTS analytics_connections (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  service     TEXT NOT NULL,
  credentials TEXT NOT NULL,
  property_id TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1,
  last_sync_at INTEGER,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(brand_id, service)
);

CREATE TABLE IF NOT EXISTS analytics_snapshots (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  service     TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  metrics     TEXT NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(brand_id, service, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_analytics_brand_date ON analytics_snapshots(brand_id, metric_date);

CREATE TABLE IF NOT EXISTS analytics_daily_rollup (
  id                        TEXT PRIMARY KEY,
  brand_id                  TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  metric_date               TEXT NOT NULL,
  website_sessions          INTEGER DEFAULT 0,
  website_users             INTEGER DEFAULT 0,
  organic_clicks            INTEGER DEFAULT 0,
  organic_impressions       INTEGER DEFAULT 0,
  avg_position              REAL,
  social_impressions        INTEGER DEFAULT 0,
  social_engagements        INTEGER DEFAULT 0,
  social_followers_delta    INTEGER DEFAULT 0,
  email_sent                INTEGER DEFAULT 0,
  email_opens               INTEGER DEFAULT 0,
  email_clicks              INTEGER DEFAULT 0,
  ad_spend                  REAL DEFAULT 0,
  ad_clicks                 INTEGER DEFAULT 0,
  ad_conversions            INTEGER DEFAULT 0,
  created_at                INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(brand_id, metric_date)
);

-- ============================================================
-- EMAIL
-- ============================================================

CREATE TABLE IF NOT EXISTS email_lists (
  id               TEXT PRIMARY KEY,
  brand_id         TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  subscriber_count INTEGER DEFAULT 0,
  created_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS email_subscribers (
  id               TEXT PRIMARY KEY,
  list_id          TEXT NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  brand_id         TEXT NOT NULL,
  email            TEXT NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  status           TEXT NOT NULL DEFAULT 'subscribed',
  subscribed_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  unsubscribed_at  INTEGER,
  UNIQUE(list_id, email)
);

CREATE INDEX IF NOT EXISTS idx_subscribers_brand ON email_subscribers(brand_id, status);

CREATE TABLE IF NOT EXISTS email_campaigns (
  id              TEXT PRIMARY KEY,
  brand_id        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  list_id         TEXT NOT NULL REFERENCES email_lists(id),
  content_item_id TEXT REFERENCES content_items(id),
  subject         TEXT NOT NULL,
  preview_text    TEXT,
  from_name       TEXT NOT NULL,
  from_email      TEXT NOT NULL,
  reply_to        TEXT,
  status          TEXT NOT NULL DEFAULT 'draft',
  scheduled_for   INTEGER,
  sent_at         INTEGER,
  recipient_count INTEGER DEFAULT 0,
  open_count      INTEGER DEFAULT 0,
  click_count     INTEGER DEFAULT 0,
  bounce_count    INTEGER DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- ADS
-- ============================================================

CREATE TABLE IF NOT EXISTS ad_accounts (
  id          TEXT PRIMARY KEY,
  brand_id    TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  credentials TEXT NOT NULL,
  currency    TEXT DEFAULT 'USD',
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(brand_id, platform)
);

CREATE TABLE IF NOT EXISTS ad_campaigns (
  id                   TEXT PRIMARY KEY,
  brand_id             TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  ad_account_id        TEXT NOT NULL REFERENCES ad_accounts(id),
  platform             TEXT NOT NULL,
  external_campaign_id TEXT,
  name                 TEXT NOT NULL,
  objective            TEXT,
  status               TEXT NOT NULL DEFAULT 'draft',
  daily_budget         REAL,
  start_date           TEXT,
  end_date             TEXT,
  targeting            TEXT DEFAULT '{}',
  metrics_snapshot     TEXT DEFAULT '{}',
  last_synced_at       INTEGER,
  created_at           INTEGER NOT NULL DEFAULT (unixepoch())
);

-- ============================================================
-- JOB LOGS
-- ============================================================

CREATE TABLE IF NOT EXISTS job_logs (
  id            TEXT PRIMARY KEY,
  brand_id      TEXT,
  job_type      TEXT NOT NULL,
  queue_name    TEXT NOT NULL,
  payload       TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at    INTEGER,
  completed_at  INTEGER,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON job_logs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_brand ON job_logs(brand_id, job_type);
