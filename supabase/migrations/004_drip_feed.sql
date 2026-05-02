ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_drip_feed      BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS drip_quantity     INT,
  ADD COLUMN IF NOT EXISTS drip_interval     INT,
  ADD COLUMN IF NOT EXISTS drip_runs_total   INT,
  ADD COLUMN IF NOT EXISTS drip_runs_done    INT          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS drip_next_run_at  TIMESTAMPTZ;
