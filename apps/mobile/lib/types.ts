/** Call modes matching relay server types */
export type CallMode = "relay" | "agent";

/** Call status matching relay server types */
export type CallStatus = "pending" | "calling" | "connected" | "ended" | "failed";

/** VAD mode matching relay server types */
export type VadMode = "client" | "server" | "push_to_talk";

/** POST /relay/calls/start request body */
export interface CallStartRequest {
  callId: string;
  phoneNumber: string;
  mode: CallMode;
  sourceLanguage: string;
  targetLanguage: string;
  collectedData?: Record<string, unknown>;
  vadMode: VadMode;
}

/** POST /relay/calls/start response body */
export interface CallStartResponse {
  call_id: string;
  call_sid: string;
  relay_ws_url: string;
  session_ids: {
    session_a: string;
    session_b: string;
  };
}

/** WebSocket message types (App <-> Relay Server) */
export type WsMessageType =
  // App -> Relay
  | "audio_chunk"
  | "text_input"
  | "vad_state"
  | "end_call"
  // Relay -> App
  | "caption"
  | "caption.original"
  | "caption.translated"
  | "recipient_audio"
  | "call_status"
  | "interrupt_alert"
  | "translation.state"
  | "session.recovery"
  | "error";

/** WebSocket message structure */
export interface WsMessage {
  type: WsMessageType;
  data: Record<string, unknown>;
}

/** Caption data received from relay server */
export interface CaptionData {
  text: string;
  language: string;
  isFinal: boolean;
  speaker: "user" | "recipient";
}

// --- Phase 2: Voice Mode Types ---

/** VAD state matching vad-processor states */
export type VadProcessorState = "silent" | "speaking" | "committed";

/** Audio chunk for WebSocket transmission */
export interface AudioChunk {
  /** Base64 encoded PCM16 audio data */
  audio: string;
  /** Timestamp when chunk was recorded */
  timestamp: number;
}

/** Input mode for the call */
export type InputMode = "voice" | "text";

/** Audio playback queue item */
export interface PlaybackItem {
  /** Base64 encoded PCM16 audio data */
  audio: string;
  /** Sequence number for ordering */
  seq: number;
}
