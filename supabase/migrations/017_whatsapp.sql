-- =============================================
-- Follomax - Folly on WhatsApp (official Cloud API)
-- Adds WhatsApp account linking, per-user session state, and the Cloud API secrets.
-- The WhatsApp id is the sender's phone number (wa_id), so a user who already
-- verified their phone on Telegram is auto-recognized here — one identity, both channels.
-- =============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS whatsapp_id TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  wa_id      TEXT PRIMARY KEY,
  state      JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_whatsapp_sessions_updated_at
  BEFORE UPDATE ON whatsapp_sessions
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- Only edge functions (service role) touch this; RLS on with no policies locks it down.
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

-- WhatsApp Cloud API credentials (from the Meta app — see SETUP.md §13).
INSERT INTO app_settings (key, value) VALUES
  ('whatsapp_access_token',    '"REPLACE_WITH_META_ACCESS_TOKEN"'),
  ('whatsapp_phone_number_id', '"REPLACE_WITH_PHONE_NUMBER_ID"'),
  ('whatsapp_verify_token',    '"REPLACE_WITH_A_RANDOM_VERIFY_TOKEN"'),
  ('whatsapp_app_secret',      '"REPLACE_WITH_META_APP_SECRET"')
ON CONFLICT (key) DO NOTHING;
