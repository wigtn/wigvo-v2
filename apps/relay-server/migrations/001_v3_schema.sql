-- WIGVO Realtime Relay v3 Schema Migration
-- Adds Phase 3-5 fields to existing calls table

-- Call mode and language fields
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_mode TEXT DEFAULT 'voice-to-voice';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS source_language TEXT DEFAULT 'en';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS target_language TEXT DEFAULT 'ko';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS vad_mode TEXT DEFAULT 'server';

-- Twilio / OpenAI session IDs
ALTER TABLE calls ADD COLUMN IF NOT EXISTS twilio_call_sid TEXT DEFAULT '';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS session_a_id TEXT DEFAULT '';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS session_b_id TEXT DEFAULT '';

-- Bilateral transcript: [{role, original_text, translated_text, language, timestamp}]
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_bilingual JSONB DEFAULT '[]'::jsonb;

-- Cost token tracking: {audio_input, audio_output, text_input, text_output}
ALTER TABLE calls ADD COLUMN IF NOT EXISTS cost_tokens JSONB DEFAULT '{}'::jsonb;

-- Guardrail events: [{level, original, corrected, category, correction_time_ms, timestamp}]
ALTER TABLE calls ADD COLUMN IF NOT EXISTS guardrail_events JSONB DEFAULT '[]'::jsonb;

-- Recovery events: [{type, session_label, gap_ms, attempt, status, timestamp, detail}]
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recovery_events JSONB DEFAULT '[]'::jsonb;

-- Call result (auto-judgment)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_result TEXT DEFAULT '';
ALTER TABLE calls ADD COLUMN IF NOT EXISTS call_result_data JSONB DEFAULT '{}'::jsonb;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS auto_ended BOOLEAN DEFAULT false;

-- Function calling logs
ALTER TABLE calls ADD COLUMN IF NOT EXISTS function_call_logs JSONB DEFAULT '[]'::jsonb;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calls_call_mode ON calls (call_mode);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls (created_at DESC);
