-- =============================================
-- Follomax SMM Panel - Admin Analytics RPCs
-- All functions are SECURITY DEFINER and gated with is_admin() so they can
-- aggregate across every user's data while remaining admin-only. Aggregation
-- runs in Postgres so the client only ever receives small result sets.
-- =============================================

-- Helpful indexes for the aggregations (no-ops if they already exist)
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders(created_at);
CREATE INDEX IF NOT EXISTS orders_service_id_idx ON orders(service_id);
CREATE INDEX IF NOT EXISTS transactions_type_created_idx ON transactions(type, created_at);

-- ── Headline KPIs ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_analytics_summary()
RETURNS json AS $$
DECLARE
  result json;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT json_build_object(
    'total_revenue',   COALESCE((SELECT SUM(amount) FROM transactions WHERE type = 'deposit' AND status = 'completed'), 0)::float8,
    'total_users',     (SELECT COUNT(*) FROM profiles),
    'total_orders',    (SELECT COUNT(*) FROM orders),
    'total_spent',     COALESCE((SELECT SUM(total_spent) FROM profiles), 0)::float8,
    'total_balance',   COALESCE((SELECT SUM(balance) FROM profiles), 0)::float8,
    'active_users_30d',(SELECT COUNT(DISTINCT user_id) FROM orders WHERE created_at >= now() - interval '30 days'),
    'orders_30d',      (SELECT COUNT(*) FROM orders WHERE created_at >= now() - interval '30 days')
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ── Revenue / orders / active users per day ──────────────────
CREATE OR REPLACE FUNCTION admin_revenue_timeseries(p_days int DEFAULT 30)
RETURNS TABLE(day date, revenue float8, spend float8, orders bigint, active_users bigint) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH days AS (
    SELECT gs::date AS day
    FROM generate_series(current_date - (p_days - 1), current_date, interval '1 day') gs
  ),
  rev AS (
    SELECT created_at::date AS day, SUM(amount)::float8 AS revenue
    FROM transactions
    WHERE type = 'deposit' AND status = 'completed'
      AND created_at >= current_date - (p_days - 1)
    GROUP BY 1
  ),
  spd AS (
    SELECT created_at::date AS day, SUM(charge)::float8 AS spend, COUNT(*)::bigint AS orders,
           COUNT(DISTINCT user_id)::bigint AS active_users
    FROM orders
    WHERE created_at >= current_date - (p_days - 1)
    GROUP BY 1
  )
  SELECT d.day,
         COALESCE(rev.revenue, 0)::float8,
         COALESCE(spd.spend, 0)::float8,
         COALESCE(spd.orders, 0)::bigint,
         COALESCE(spd.active_users, 0)::bigint
  FROM days d
  LEFT JOIN rev ON rev.day = d.day
  LEFT JOIN spd ON spd.day = d.day
  ORDER BY d.day;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ── Most purchased services ──────────────────────────────────
CREATE OR REPLACE FUNCTION admin_top_services(p_limit int DEFAULT 8)
RETURNS TABLE(service_id int, name text, order_count bigint, total_quantity bigint, revenue float8) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT s.id, s.name,
         COUNT(o.id)::bigint AS order_count,
         COALESCE(SUM(o.quantity), 0)::bigint AS total_quantity,
         COALESCE(SUM(o.charge), 0)::float8 AS revenue
  FROM orders o
  JOIN services s ON s.id = o.service_id
  GROUP BY s.id, s.name
  ORDER BY order_count DESC, revenue DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ── Top users by spend (with balance & order count) ──────────
CREATE OR REPLACE FUNCTION admin_top_users(p_limit int DEFAULT 10)
RETURNS TABLE(user_id uuid, email text, full_name text, total_spent float8, balance float8, order_count bigint) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name,
         COALESCE(p.total_spent, 0)::float8,
         COALESCE(p.balance, 0)::float8,
         (SELECT COUNT(*) FROM orders o WHERE o.user_id = p.id)::bigint AS order_count
  FROM profiles p
  ORDER BY p.total_spent DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

-- ── Order-frequency distribution (how often users order) ─────
CREATE OR REPLACE FUNCTION admin_user_frequency()
RETURNS TABLE(bucket text, sort_order int, users bigint) AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  WITH per_user AS (
    SELECT p.id, (SELECT COUNT(*) FROM orders o WHERE o.user_id = p.id) AS n
    FROM profiles p
  ),
  labelled AS (
    SELECT CASE
             WHEN n = 0 THEN 'None'
             WHEN n = 1 THEN '1 order'
             WHEN n BETWEEN 2 AND 3 THEN '2–3'
             WHEN n BETWEEN 4 AND 6 THEN '4–6'
             WHEN n BETWEEN 7 AND 10 THEN '7–10'
             ELSE '11+'
           END AS bucket,
           CASE
             WHEN n = 0 THEN 0
             WHEN n = 1 THEN 1
             WHEN n BETWEEN 2 AND 3 THEN 2
             WHEN n BETWEEN 4 AND 6 THEN 3
             WHEN n BETWEEN 7 AND 10 THEN 4
             ELSE 5
           END AS sort_order
    FROM per_user
  )
  SELECT l.bucket, l.sort_order, COUNT(*)::bigint AS users
  FROM labelled l
  GROUP BY l.bucket, l.sort_order
  ORDER BY l.sort_order;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;
