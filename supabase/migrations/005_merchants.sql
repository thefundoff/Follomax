-- Add merchant role
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'merchant', 'admin'));

-- Add merchant fields to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Create merchant_services table (custom pricing per merchant per service)
CREATE TABLE IF NOT EXISTS merchant_services (
  id           SERIAL PRIMARY KEY,
  merchant_id  UUID          NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id   INT           NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  rate         NUMERIC(10,6) NOT NULL,
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ   DEFAULT now(),
  updated_at   TIMESTAMPTZ   DEFAULT now(),
  UNIQUE(merchant_id, service_id)
);

-- Add merchant_commission transaction type
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_type_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('deposit', 'order_charge', 'refund', 'admin_adjustment', 'merchant_commission'));

-- RLS for merchant_services
ALTER TABLE merchant_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants manage own service rates" ON merchant_services
  FOR ALL USING (merchant_id = auth.uid());

-- Update handle_new_user trigger to support referral codes
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_merchant_id UUID;
  v_ref_code    TEXT;
BEGIN
  v_ref_code := new.raw_user_meta_data->>'referral_code';

  IF v_ref_code IS NOT NULL THEN
    SELECT id INTO v_merchant_id
    FROM profiles
    WHERE referral_code = v_ref_code
      AND role = 'merchant'
      AND is_active = true
    LIMIT 1;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, role, merchant_id)
  VALUES (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'user',
    v_merchant_id
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;
