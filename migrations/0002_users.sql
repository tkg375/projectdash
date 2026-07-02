-- Users table for multi-account support
CREATE TABLE IF NOT EXISTS users (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name         TEXT NOT NULL,
  plan         TEXT NOT NULL DEFAULT 'free',
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Add user_id to brands
ALTER TABLE brands ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

-- Add user_id to sessions
ALTER TABLE sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_brands_user_id ON brands(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
