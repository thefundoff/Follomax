-- =============================================
-- Follomax SMM Panel - Telegram assistant ("Folly")
-- Links Telegram users to Follomax accounts, holds one-time connect codes,
-- and per-user conversation state for the Gemini-powered agent.
-- =============================================

-- Link a Telegram account to a Follomax profile (set when the user connects).
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS telegram_user_id BIGINT UNIQUE;

-- One-time codes generated on the web Profile page. The user opens
-- t.me/<bot>?start=<code>; the bot verifies the code here, then stamps
-- profiles.telegram_user_id. Codes are single-use and short-lived.
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code        TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_id ON telegram_link_codes(user_id);

-- Per-Telegram-user conversation state for Folly: a trimmed chat history plus any
-- order awaiting confirmation. Keyed by Telegram user id so it exists even before
-- the account is linked.
CREATE TABLE IF NOT EXISTS telegram_sessions (
  telegram_user_id BIGINT PRIMARY KEY,
  state            JSONB NOT NULL DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_telegram_sessions_updated_at
  BEFORE UPDATE ON telegram_sessions
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- These tables are only ever touched by edge functions using the service-role key
-- (which bypasses RLS). Enable RLS with no policies so nothing is reachable with the
-- anon/authenticated keys.
ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_sessions ENABLE ROW LEVEL SECURITY;

-- Bot / AI secrets (same app_settings convention as exobooster_api_key, korapay_secret_key).
INSERT INTO app_settings (key, value) VALUES
  ('telegram_bot_token',      '"REPLACE_WITH_YOUR_TELEGRAM_BOT_TOKEN"'),
  ('telegram_bot_username',   '"YourBotUsername"'),
  ('telegram_webhook_secret', '"REPLACE_WITH_A_LONG_RANDOM_STRING"'),
  ('gemini_api_key',          '"REPLACE_WITH_YOUR_GEMINI_API_KEY"'),
  ('gemini_model',            '"gemini-flash-latest"'),
  ('web_app_url',             '"https://follomax.com"')
ON CONFLICT (key) DO NOTHING;
