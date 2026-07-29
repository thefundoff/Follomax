-- =============================================
-- Follomax - In-app notifications (order status alerts for the web app)
-- Telegram/WhatsApp get pushed a message directly; the web app reads unread rows here
-- (surfaced by Folly). Rows are inserted by edge functions (service role); users can
-- only read and mark-read their own.
-- =============================================

CREATE TABLE IF NOT EXISTS notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title      text NOT NULL,
  body       text NOT NULL,
  order_id   uuid,
  type       text NOT NULL DEFAULT 'order',
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select_own ON notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notifications_update_own ON notifications FOR UPDATE USING (auth.uid() = user_id);
