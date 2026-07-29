-- =============================================
-- Follomax SMM Panel - Minimum quantity floor
-- Every non-comment service must have a minimum order count of at least 100.
-- Comment services (type contains 'comment') keep their provider minimum.
-- Future syncs enforce the same rule in the sync-services edge function.
-- =============================================

-- LEAST(100, max_quantity) guards against setting min above a service's max,
-- which would make the service unorderable.
UPDATE services
SET min_quantity = LEAST(100, max_quantity)
WHERE min_quantity < 100
  AND (type IS NULL OR lower(type) NOT LIKE '%comment%');
