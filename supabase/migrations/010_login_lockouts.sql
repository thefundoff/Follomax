-- =============================================
-- Follomax - Server-side login lockout (free-tier alternative to Auth Hooks)
-- =============================================
-- The Postgres "Password Verification" auth hook (migration 007) requires a paid
-- plan. This achieves the same thing on the free tier: the `secure-login` edge
-- function checks/updates this table on every login attempt, enforcing
-- 3 failures -> 15 minute lock. Keyed by email and only reachable by the
-- service role, so it can't be bypassed from the browser.
--
-- If you're on the free tier you can SKIP migration 007 and its dashboard hook
-- step entirely, and use this + the secure-login function instead.
-- =============================================

CREATE TABLE IF NOT EXISTS login_lockouts (
  email        TEXT PRIMARY KEY,
  failed_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Only the service role (edge functions) may read/write this. RLS on with no
-- policies = no access for anon/authenticated; service_role bypasses RLS.
ALTER TABLE login_lockouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON login_lockouts FROM authenticated, anon, public;
