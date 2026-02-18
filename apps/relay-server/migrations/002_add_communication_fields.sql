-- WIGVO: Add communication fields to calls table (nullable)
-- target_name, target_phone, communication_mode
--
-- NOTE: target_name, target_phone already existed as NOT NULL.
-- ADD COLUMN IF NOT EXISTS skips existing columns, so we must
-- explicitly DROP NOT NULL to make them nullable.

ALTER TABLE calls ADD COLUMN IF NOT EXISTS communication_mode TEXT;
ALTER TABLE calls ALTER COLUMN target_phone DROP NOT NULL;
ALTER TABLE calls ALTER COLUMN target_name DROP NOT NULL;
