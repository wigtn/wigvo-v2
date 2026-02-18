// =============================================================================
// Relay Server 통화 관련 타입 정의
// =============================================================================
// Relay Server (wigvo/apps/relay-server/src/types.py) 와 동기화
// =============================================================================

// --- WebSocket Message Types ---

export enum WsMessageType {
  // App → Relay
  AUDIO_CHUNK = 'audio_chunk',
  TEXT_INPUT = 'text_input',
  VAD_STATE = 'vad_state',
  END_CALL = 'end_call',

  // Relay → App
  CAPTION = 'caption',
  CAPTION_ORIGINAL = 'caption.original',
  CAPTION_TRANSLATED = 'caption.translated',
  RECIPIENT_AUDIO = 'recipient_audio',
  CALL_STATUS = 'call_status',
  INTERRUPT_ALERT = 'interrupt_alert',
  SESSION_RECOVERY = 'session.recovery',
  GUARDRAIL_TRIGGERED = 'guardrail.triggered',
  TRANSLATION_STATE = 'translation.state',
  ERROR = 'error',
}

// --- Call Mode ---

export type CallMode = 'agent' | 'relay';

// --- Caption ---

export interface CaptionEntry {
  id: string;
  speaker: 'user' | 'recipient' | 'ai';
  text: string;
  language: string;
  isFinal: boolean;
  timestamp: number;
  stage?: 1 | 2;
}

// --- WebSocket Message ---

export interface RelayWsMessage {
  type: WsMessageType;
  data: Record<string, unknown>;
}

// --- Call Start / End ---

export interface CallStartParams {
  call_id: string;
  phone_number: string;
  mode: CallMode;
  source_language: string;
  target_language: string;
  vad_mode: 'client' | 'server' | 'push_to_talk';
  collected_data: Record<string, unknown> | null;
  system_prompt_override?: string;
}

export interface CallStartResult {
  call_id: string;
  call_sid: string;
  relay_ws_url: string;
  session_ids: Record<string, string>;
}
