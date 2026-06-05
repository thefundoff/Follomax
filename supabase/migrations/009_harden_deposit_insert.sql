-- =============================================
-- Follomax SMM Panel - Harden deposit_requests inserts
-- =============================================
-- The original "deposits_insert_own" policy only checked user_id, so a user
-- could insert a row pre-set to status='approved' (or with reviewer fields
-- filled in). Crediting only happens in edge functions, so this wasn't directly
-- exploitable for funds, but it lets users forge "approved" deposit history and
-- confuses the admin review queue. Force every user-created deposit to start as
-- a clean pending request; only edge functions / admins can approve.
-- =============================================

DROP POLICY IF EXISTS "deposits_insert_own" ON deposit_requests;

CREATE POLICY "deposits_insert_own"
  ON deposit_requests FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'pending'
    AND amount > 0
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND flw_tx_id IS NULL
  );
