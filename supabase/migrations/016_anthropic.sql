-- =============================================
-- Follomax - Folly AI provider → Anthropic (Claude)
-- Folly's chat now uses the Anthropic Messages API instead of Gemini. Adds the
-- Claude settings; the old gemini_* keys are left in place (unused) so nothing breaks.
-- =============================================

INSERT INTO app_settings (key, value) VALUES
  ('anthropic_api_key', '"REPLACE_WITH_YOUR_ANTHROPIC_API_KEY"'),
  ('anthropic_model',   '"claude-haiku-4-5"')
ON CONFLICT (key) DO NOTHING;
