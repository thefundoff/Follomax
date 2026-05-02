-- Widen rate columns from NUMERIC(10,6) to NUMERIC(16,6)
-- NUMERIC(10,6) only allows up to 9999.999999 (4 digits before decimal).
-- NUMERIC(16,6) allows up to 9,999,999,999.999999 — enough for any realistic rate.

ALTER TABLE services
  ALTER COLUMN rate TYPE NUMERIC(16,6);

ALTER TABLE merchant_services
  ALTER COLUMN rate TYPE NUMERIC(16,6);
