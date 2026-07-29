-- =============================================
-- Follomax SMM Panel - Algorithm Booster (combo deals)
-- =============================================

-- Preset combo package (a tier) for a platform
CREATE TABLE IF NOT EXISTS combo_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform text NOT NULL,               -- 'instagram' | 'tiktok'
  name text NOT NULL,                   -- 'Starter' | 'Growth' | 'Viral'
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Each component line of a combo: which service + how many
CREATE TABLE IF NOT EXISTS combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id uuid NOT NULL REFERENCES combo_packages(id) ON DELETE CASCADE,
  component text NOT NULL,              -- 'followers'|'views'|'likes'|'shares'|'saves'
  service_id int NOT NULL REFERENCES services(id),
  quantity int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS combo_items_combo_idx ON combo_items(combo_id);

-- Group the sub-orders produced by one combo purchase
ALTER TABLE orders ADD COLUMN IF NOT EXISTS combo_group_id uuid;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS combo_label text;
CREATE INDEX IF NOT EXISTS orders_combo_group_idx ON orders(combo_group_id);

-- =============================================
-- RLS (mirrors services: read active for everyone, write for admins)
-- =============================================
ALTER TABLE combo_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "combo_packages_select_active"
  ON combo_packages FOR SELECT
  USING (is_active = true OR is_admin());

CREATE POLICY "combo_packages_insert_admin"
  ON combo_packages FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "combo_packages_update_admin"
  ON combo_packages FOR UPDATE
  USING (is_admin());

CREATE POLICY "combo_packages_delete_admin"
  ON combo_packages FOR DELETE
  USING (is_admin());

ALTER TABLE combo_items ENABLE ROW LEVEL SECURITY;

-- Item is visible when its parent combo is visible
CREATE POLICY "combo_items_select_active"
  ON combo_items FOR SELECT
  USING (
    is_admin() OR EXISTS (
      SELECT 1 FROM combo_packages p
      WHERE p.id = combo_items.combo_id AND p.is_active = true
    )
  );

CREATE POLICY "combo_items_insert_admin"
  ON combo_items FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY "combo_items_update_admin"
  ON combo_items FOR UPDATE
  USING (is_admin());

CREATE POLICY "combo_items_delete_admin"
  ON combo_items FOR DELETE
  USING (is_admin());
