-- =============================================
-- Follomax SMM Panel - Server-side login rate limiting
-- =============================================
-- Enforces: 3 failed password attempts locks the account for 15 minutes.
-- This runs inside Supabase Auth (GoTrue) via the "Password Verification"
-- auth hook, so it cannot be bypassed by the browser (unlike the client-side
-- lockout in src/lib/validation.ts, which is only a UX nicety).
--
-- AFTER applying this migration you MUST enable the hook:
--   Dashboard -> Authentication -> Hooks -> "Password Verification attempt"
--   -> select the postgres function `public.hook_password_verification`.
-- (Or set auth.hook.password_verification_attempt in config.toml for local dev.)
-- =============================================

-- Per-user attempt tracking. Keyed on the auth user id (server-trusted),
-- so clearing localStorage / using incognito does NOT reset it.
CREATE TABLE IF NOT EXISTS login_attempts (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lock the table down: only the auth admin (which runs the hook) may touch it.
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE login_attempts FROM authenticated, anon, public;

CREATE OR REPLACE FUNCTION public.hook_password_verification(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid          UUID    := (event->>'user_id')::uuid;
  pwd_valid    BOOLEAN := (event->>'valid')::boolean;
  attempts     INT;
  locked       TIMESTAMPTZ;
  max_attempts CONSTANT INT      := 3;
  lock_window  CONSTANT INTERVAL := INTERVAL '15 minutes';
BEGIN
  SELECT failed_count, locked_until
    INTO attempts, locked
    FROM login_attempts
   WHERE user_id = uid;

  -- Already locked? Reject every attempt (right or wrong) until it expires.
  IF locked IS NOT NULL AND locked > now() THEN
    RETURN jsonb_build_object(
      'decision', 'reject',
      'message',  'Too many failed login attempts. Please try again in a few minutes.'
    );
  END IF;

  -- Correct password and not locked: clear the counter and let them in.
  IF pwd_valid THEN
    DELETE FROM login_attempts WHERE user_id = uid;
    RETURN jsonb_build_object('decision', 'continue');
  END IF;

  -- Wrong password: increment the failure counter.
  INSERT INTO login_attempts (user_id, failed_count, updated_at)
  VALUES (uid, 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET failed_count = login_attempts.failed_count + 1,
        locked_until = NULL,
        updated_at   = now()
  RETURNING failed_count INTO attempts;

  -- Hit the limit: lock for the window and reset the counter.
  IF attempts >= max_attempts THEN
    UPDATE login_attempts
       SET locked_until = now() + lock_window,
           failed_count = 0,
           updated_at   = now()
     WHERE user_id = uid;

    RETURN jsonb_build_object(
      'decision', 'reject',
      'message',  'Too many failed login attempts. Your account is locked for 15 minutes.'
    );
  END IF;

  RETURN jsonb_build_object('decision', 'continue');
END;
$$;

-- Only the auth admin may run the hook / read the table.
GRANT EXECUTE ON FUNCTION public.hook_password_verification(jsonb) TO supabase_auth_admin;
REVOKE EXECUTE ON FUNCTION public.hook_password_verification(jsonb) FROM authenticated, anon, public;
GRANT ALL ON TABLE login_attempts TO supabase_auth_admin;
