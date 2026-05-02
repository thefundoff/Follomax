-- =============================================
-- Follomax SMM Panel - RLS Policies
-- =============================================

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- =============================================
-- profiles RLS
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  USING (auth.uid() = id OR is_admin());

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE
  USING (is_admin());

-- =============================================
-- categories RLS
-- =============================================
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_all"
  ON categories FOR SELECT
  USING (is_active = true OR is_admin());

CREATE POLICY "categories_insert_admin"
  ON categories FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "categories_update_admin"
  ON categories FOR UPDATE
  USING (is_admin());

CREATE POLICY "categories_delete_admin"
  ON categories FOR DELETE
  USING (is_admin());

-- =============================================
-- services RLS
-- =============================================
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_select_active"
  ON services FOR SELECT
  USING (is_active = true OR is_admin());

CREATE POLICY "services_insert_admin"
  ON services FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "services_update_admin"
  ON services FOR UPDATE
  USING (is_admin());

CREATE POLICY "services_delete_admin"
  ON services FOR DELETE
  USING (is_admin());

-- =============================================
-- orders RLS
-- =============================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_select_own"
  ON orders FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "orders_insert_own"
  ON orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "orders_update_admin"
  ON orders FOR UPDATE
  USING (is_admin());

-- =============================================
-- transactions RLS
-- =============================================
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select_own"
  ON transactions FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

-- Only service_role (edge functions) can insert transactions
-- No direct insert policy for authenticated users

-- =============================================
-- deposit_requests RLS
-- =============================================
ALTER TABLE deposit_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deposits_select_own"
  ON deposit_requests FOR SELECT
  USING (auth.uid() = user_id OR is_admin());

CREATE POLICY "deposits_insert_own"
  ON deposit_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "deposits_update_admin"
  ON deposit_requests FOR UPDATE
  USING (is_admin());

-- =============================================
-- app_settings RLS
-- =============================================
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "settings_all_admin"
  ON app_settings FOR ALL
  USING (is_admin());
