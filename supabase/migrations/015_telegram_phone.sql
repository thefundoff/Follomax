-- =============================================
-- Follomax SMM Panel - Verified phone number
-- Captured in-chat (Telegram "share contact") during Folly onboarding. Storing it
-- lets the same person map to the same Follomax account across Telegram and, later,
-- WhatsApp (where the phone number is the identity).
-- =============================================

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- Non-unique for now (existing web accounts have no phone; WhatsApp phase can dedupe).
CREATE INDEX IF NOT EXISTS idx_profiles_phone_number ON profiles(phone_number) WHERE phone_number IS NOT NULL;
