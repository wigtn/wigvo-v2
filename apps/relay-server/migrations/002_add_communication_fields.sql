-- WIGVO: Add communication fields to calls table (nullable)
-- target_name, target_phone, communication_mode

ALTER TABLE calls ADD COLUMN IF NOT EXISTS target_name TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS target_phone TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS communication_mode TEXT;
