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

// --- Communication Mode (v4: 4가지 통화 모드) ---

export type CommunicationMode =
  | 'voice_to_voice'   // 양방향 음성 번역
  | 'text_to_voice'    // 텍스트 입력 → AI 음성 전달
  | 'voice_to_text'    // 상대방 음성 → 자막 표시
  | 'full_agent';      // AI 자율 통화

export interface ModeUIConfig {
  audioInput: boolean;   // 마이크 녹음 활성화
  audioOutput: boolean;  // 수신자 음성 재생
  textInput: boolean;    // 텍스트 입력 UI 표시
  captionOnly: boolean;  // 자막 확대 모드
}

export function communicationModeToCallMode(mode: CommunicationMode): CallMode {
  return mode === 'full_agent' ? 'agent' : 'relay';
}

export function getModeUIConfig(mode: CommunicationMode): ModeUIConfig {
  switch (mode) {
    case 'voice_to_voice':
      return { audioInput: true, audioOutput: true, textInput: false, captionOnly: false };
    case 'text_to_voice':
      return { audioInput: false, audioOutput: true, textInput: true, captionOnly: false };
    case 'voice_to_text':
      return { audioInput: true, audioOutput: false, textInput: false, captionOnly: true };
    case 'full_agent':
      return { audioInput: false, audioOutput: true, textInput: true, captionOnly: false };
  }
}

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
  communication_mode?: CommunicationMode;
}

export interface CallStartResult {
  call_id: string;
  call_sid: string;
  relay_ws_url: string;
  session_ids: Record<string, string>;
}
