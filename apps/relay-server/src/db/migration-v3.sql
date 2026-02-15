-- Migration: Add v3 Realtime Relay fields to calls table
-- Run against Supabase SQL Editor

-- Add new columns to calls table
ALTER TABLE calls
  ADD COLUMN IF NOT EXISTS call_mode text DEFAULT 'voice-to-voice',
  ADD COLUMN IF NOT EXISTS source_language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS target_language text DEFAULT 'ko',
  ADD COLUMN IF NOT EXISTS twilio_call_sid text,
  ADD COLUMN IF NOT EXISTS session_a_id text,
  ADD COLUMN IF NOT EXISTS session_b_id text,
  ADD COLUMN IF NOT EXISTS transcript_bilingual jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS vad_mode text DEFAULT 'client',
  ADD COLUMN IF NOT EXISTS cost_tokens jsonb DEFAULT '{"session_a_input": 0, "session_a_output": 0, "session_b_input": 0, "session_b_output": 0, "guardrail_tokens": 0}'::jsonb,
  ADD COLUMN IF NOT EXISTS guardrail_events jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recovery_events jsonb DEFAULT '[]'::jsonb;

-- Add constraint for call_mode
ALTER TABLE calls
  ADD CONSTRAINT calls_call_mode_check
  CHECK (call_mode IN ('voice-to-voice', 'chat-to-voice', 'voice-to-text'));

-- Add constraint for vad_mode
ALTER TABLE calls
  ADD CONSTRAINT calls_vad_mode_check
  CHECK (vad_mode IN ('client', 'server', 'push-to-talk'));

-- Index for Twilio call SID lookups
CREATE INDEX IF NOT EXISTS idx_calls_twilio_call_sid ON calls (twilio_call_sid);

-- Index for call_mode analytics
CREATE INDEX IF NOT EXISTS idx_calls_call_mode ON calls (call_mode);

-- RLS policy: users can only see their own calls
-- (assuming user_id column exists from v1/v2)
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view own calls"
  ON calls FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can insert own calls"
  ON calls FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY IF NOT EXISTS "Users can update own calls"
  ON calls FOR UPDATE
  USING (auth.uid() = user_id);
