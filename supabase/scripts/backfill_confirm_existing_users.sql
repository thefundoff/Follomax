-- =============================================
-- Follomax - One-off backfill: confirm existing users
-- =============================================
-- Run this ONCE, in the Supabase SQL editor, BEFORE enabling
-- Authentication -> Providers -> Email -> "Confirm email".
--
-- Why: once "Confirm email" is ON, GoTrue blocks login for any user whose
-- auth.users.email_confirmed_at is NULL. Accounts created before you flip the
-- switch were never asked to confirm, so they'd be locked out. This grandfathers
-- them in.
--
-- NOTE: `confirmed_at` is a generated column in GoTrue and cannot be written —
-- only set `email_confirmed_at`.
-- =============================================


-- ---------------------------------------------------------------------------
-- STEP 1 (read-only): review who is currently unconfirmed before changing anything.
-- ---------------------------------------------------------------------------
SELECT
  u.id,
  u.email,
  u.created_at,
  p.balance,
  (SELECT count(*) FROM orders o            WHERE o.user_id = u.id) AS orders,
  (SELECT count(*) FROM deposit_requests d  WHERE d.user_id = u.id) AS deposits
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE u.email_confirmed_at IS NULL
ORDER BY u.created_at DESC;


-- ---------------------------------------------------------------------------
-- STEP 2 (RECOMMENDED): confirm only accounts that show real activity.
-- Leaves dormant junk signups (e.g. chioma@hmail.com that never did anything)
-- unconfirmed, so enabling "Confirm email" effectively filters them out.
-- A user counts as "real" if they hold a balance, or have any order, deposit,
-- or transaction history.
-- ---------------------------------------------------------------------------
UPDATE auth.users u
SET email_confirmed_at = now()
WHERE u.email_confirmed_at IS NULL
  AND (
       EXISTS (SELECT 1 FROM profiles         p WHERE p.id = u.id AND p.balance > 0)
    OR EXISTS (SELECT 1 FROM orders           o WHERE o.user_id = u.id)
    OR EXISTS (SELECT 1 FROM deposit_requests d WHERE d.user_id = u.id)
    OR EXISTS (SELECT 1 FROM transactions     t WHERE t.user_id = u.id)
  );


-- ---------------------------------------------------------------------------
-- STEP 3 (FALLBACK — only if you'd rather confirm EVERYONE, junk included).
-- Run this INSTEAD of Step 2 if you don't want to filter by activity.
-- ---------------------------------------------------------------------------
-- UPDATE auth.users
-- SET email_confirmed_at = now()
-- WHERE email_confirmed_at IS NULL;


-- ---------------------------------------------------------------------------
-- STEP 4 (read-only): verify nothing unconfirmed remains that you expected to keep.
-- ---------------------------------------------------------------------------
SELECT count(*) AS still_unconfirmed
FROM auth.users
WHERE email_confirmed_at IS NULL;
