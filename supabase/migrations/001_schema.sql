-- =============================================
-- Follomax SMM Panel - Initial Schema
-- =============================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS moddatetime;

-- =============================================
-- profiles
-- =============================================
CREATE TABLE profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  balance       NUMERIC(12,4) NOT NULL DEFAULT 0,
  api_key       UUID NOT NULL DEFAULT gen_random_uuid(),
  total_spent   NUMERIC(12,4) NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- Auto-create profile when user signs up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- =============================================
-- categories
-- =============================================
CREATE TABLE categories (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  slug       TEXT NOT NULL UNIQUE,
  icon       TEXT DEFAULT '📦',
  sort_order INT NOT NULL DEFAULT 0,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================
-- services
-- =============================================
CREATE TABLE services (
  id               SERIAL PRIMARY KEY,
  exobooster_id    INT NOT NULL UNIQUE,
  category_id      INT REFERENCES categories(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  type             TEXT,
  rate             NUMERIC(10,6) NOT NULL,
  min_quantity     INT NOT NULL DEFAULT 10,
  max_quantity     INT NOT NULL DEFAULT 10000,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  refill           BOOLEAN NOT NULL DEFAULT false,
  cancel           BOOLEAN NOT NULL DEFAULT false,
  last_synced_at   TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_category ON services(category_id);
CREATE INDEX idx_services_active ON services(is_active);

CREATE TRIGGER set_services_updated_at
  BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================
-- orders
-- =============================================
CREATE TABLE orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  service_id          INT NOT NULL REFERENCES services(id),
  exobooster_order_id BIGINT,
  link                TEXT NOT NULL,
  quantity            INT NOT NULL,
  charge              NUMERIC(12,4) NOT NULL,
  start_count         INT,
  remains             INT,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending','processing','in_progress','completed','partial','cancelled','error')
  ),
  error_message       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX idx_orders_exobooster_id ON orders(exobooster_order_id) WHERE exobooster_order_id IS NOT NULL;

CREATE TRIGGER set_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- =============================================
-- transactions
-- =============================================
CREATE TABLE transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (
    type IN ('deposit', 'order_charge', 'refund', 'admin_adjustment')
  ),
  amount          NUMERIC(12,4) NOT NULL,
  balance_before  NUMERIC(12,4) NOT NULL,
  balance_after   NUMERIC(12,4) NOT NULL,
  reference_id    UUID,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (
    status IN ('pending', 'completed', 'failed')
  ),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON transactions(user_id);
CREATE INDEX idx_transactions_created_at ON transactions(created_at DESC);

-- =============================================
-- deposit_requests
-- =============================================
CREATE TABLE deposit_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount        NUMERIC(12,4) NOT NULL,
  method        TEXT NOT NULL DEFAULT 'flutterwave',
  flw_tx_id     TEXT,
  flw_tx_ref    TEXT UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'failed')
  ),
  admin_note    TEXT,
  reviewed_by   UUID REFERENCES profiles(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_deposit_requests_user_id ON deposit_requests(user_id);
CREATE INDEX idx_deposit_requests_status ON deposit_requests(status);
CREATE INDEX idx_deposit_requests_flw_tx_ref ON deposit_requests(flw_tx_ref) WHERE flw_tx_ref IS NOT NULL;

-- =============================================
-- app_settings
-- =============================================
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW EXECUTE FUNCTION moddatetime('updated_at');

-- Seed default settings
INSERT INTO app_settings (key, value) VALUES
  ('exobooster_api_key',      '"REPLACE_WITH_YOUR_EXOBOOSTER_API_KEY"'),
  ('exobooster_api_url',      '"https://exobooster.com/api/v2"'),
  ('flw_secret_key',          '"REPLACE_WITH_YOUR_FLUTTERWAVE_SECRET_KEY"'),
  ('flw_webhook_secret_hash', '"REPLACE_WITH_YOUR_FLW_WEBHOOK_HASH"'),
  ('site_name',               '"Follomax"'),
  ('site_tagline',            '"Grow Your Social Media. Fast."'),
  ('currency',                '"USD"'),
  ('min_deposit_amount',      '5'),
  ('maintenance_mode',        'false'),
  ('bank_account_details',    '{"bank_name":"","account_name":"","account_number":"","routing_number":"","swift_code":""}');
