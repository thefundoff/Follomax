-- =============================================
-- Follomax SMM Panel - Protect financial/privilege columns on profiles
-- =============================================
-- CRITICAL FIX. The "profiles_update_own" RLS policy lets a user UPDATE their
-- own row and only checks that `role` is unchanged. Nothing stopped a user from
-- running, via the public anon key:
--
--     supabase.from('profiles').update({ balance: 9999999 }).eq('id', myId)
--
-- ...giving themselves unlimited free funds and bypassing payment entirely.
-- RLS column protection can't distinguish admin from user (both are the
-- `authenticated` role), so we use a BEFORE UPDATE trigger instead.
--
-- Allowed for a normal user: full_name, api_key (the only fields the app lets
-- them self-edit). Everything money/identity related is frozen.
-- Edge functions (service_role, auth.uid() IS NULL) and admins bypass.
-- =============================================

CREATE OR REPLACE FUNCTION protect_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role / edge functions have no auth.uid() — they are trusted.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins may change anything (balance adjustments, role, activation, etc.).
  IF is_admin() THEN
    RETURN NEW;
  END IF;

  -- Regular users: reject any change to protected columns.
  IF NEW.balance       IS DISTINCT FROM OLD.balance
     OR NEW.total_spent   IS DISTINCT FROM OLD.total_spent
     OR NEW.role          IS DISTINCT FROM OLD.role
     OR NEW.is_active     IS DISTINCT FROM OLD.is_active
     OR NEW.merchant_id   IS DISTINCT FROM OLD.merchant_id
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.email         IS DISTINCT FROM OLD.email
     OR NEW.id            IS DISTINCT FROM OLD.id
     OR NEW.created_at    IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Not allowed to modify protected profile fields';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS protect_profile_columns_trigger ON profiles;
CREATE TRIGGER protect_profile_columns_trigger
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_columns();
