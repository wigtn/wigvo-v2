import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { CostTokens } from './cost-tracker.js';
import type { GuardrailEvent } from '../guardrail/checker.js';
import type { RecoveryEvent } from '../realtime/session-recovery.js';
import type { TranscriptEntry, CallMode, Language } from '../types.js';

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

export interface CallRecord {
  id: string;
  user_id: string;
  call_mode: CallMode;
  source_language: Language;
  target_language: Language;
  twilio_call_sid: string;
  session_a_id: string | null;
  session_b_id: string | null;
  status: string;
  duration_seconds: number;
  transcript_bilingual: TranscriptEntry[];
  vad_mode: string;
  cost_tokens: CostTokens;
  guardrail_events: GuardrailEvent[];
  recovery_events: RecoveryEvent[];
}

/**
 * Save call completion data to Supabase.
 */
export async function saveCallResult(callId: string, data: Partial<CallRecord>) {
  const { error } = await supabase
    .from('calls')
    .update({
      status: data.status ?? 'completed',
      duration_seconds: data.duration_seconds,
      transcript_bilingual: data.transcript_bilingual,
      cost_tokens: data.cost_tokens,
      guardrail_events: data.guardrail_events,
      recovery_events: data.recovery_events,
      session_a_id: data.session_a_id,
      session_b_id: data.session_b_id,
      ended_at: new Date().toISOString(),
    })
    .eq('id', callId);

  if (error) {
    console.error('[CallRepository] Failed to save call result:', error);
  }
}

/**
 * Create initial call record when a call starts.
 */
export async function createCallRecord(data: {
  id: string;
  user_id: string;
  call_mode: CallMode;
  source_language: Language;
  target_language: Language;
  twilio_call_sid: string;
  vad_mode: string;
}) {
  const { error } = await supabase
    .from('calls')
    .insert({
      id: data.id,
      user_id: data.user_id,
      call_mode: data.call_mode,
      source_language: data.source_language,
      target_language: data.target_language,
      twilio_call_sid: data.twilio_call_sid,
      vad_mode: data.vad_mode,
      status: 'calling',
      started_at: new Date().toISOString(),
    });

  if (error) {
    console.error('[CallRepository] Failed to create call record:', error);
  }
}
