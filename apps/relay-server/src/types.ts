// ── Language ──
export type Language = 'en' | 'ko';

// ── Call Modes ──
export type SessionMode = 'relay' | 'agent';
export type CallMode = 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text';
export type VadMode = 'client' | 'server' | 'push-to-talk';

// ── Call Status ──
export type CallStatus =
  | 'pending'
  | 'calling'
  | 'ringing'
  | 'connected'
  | 'active'
  | 'ending'
  | 'completed'
  | 'failed'
  | 'no_answer'
  | 'busy';

// ── Call Start Request ──
export interface CallStartRequest {
  callId: string;
  mode: SessionMode;
  callMode: CallMode;
  sourceLanguage: Language;
  targetLanguage: Language;
  collectedData?: CollectedData;
}

export interface CollectedData {
  scenarioType: string;
  service: string;
  targetName: string;
  targetPhone: string;
  customerName: string;
  details: Record<string, string>;
}

// ── Call Start Response ──
export interface CallStartResponse {
  success: true;
  data: {
    callSid: string;
    sessionA: { id: string; status: string };
    sessionB: { id: string; status: string };
    relayWsUrl: string;
    mode: SessionMode;
    callMode: CallMode;
  };
}

// ── WebSocket Messages: Client → Server ──
export type ClientMessage =
  | { type: 'audio.chunk'; audio: string; timestamp: number }
  | { type: 'audio.commit'; timestamp: number }
  | { type: 'text.send'; text: string }
  | { type: 'vad.speech_start'; timestamp: number }
  | { type: 'vad.speech_end'; timestamp: number }
  | { type: 'call.end' };

// ── WebSocket Messages: Server → Client ──
export type ServerMessage =
  | { type: 'transcript.user'; text: string; language: Language; timestamp: number }
  | { type: 'transcript.user.translated'; text: string; language: Language; timestamp: number }
  | { type: 'transcript.recipient'; text: string; language: Language; timestamp: number }
  | { type: 'transcript.recipient.translated'; text: string; language: Language; timestamp: number }
  | { type: 'audio.recipient'; audio: string }
  | { type: 'audio.recipient.translated'; audio: string }
  | { type: 'call.status'; status: CallStatus; message?: string }
  | { type: 'call.warning'; remainingMs: number; message: string }
  | { type: 'session.recovery'; status: string; gapMs: number }
  | { type: 'guardrail.triggered'; level: number; original: string; corrected?: string }
  | { type: 'interrupt.detected'; source: 'recipient' | 'user' }
  | { type: 'error'; code: string; message: string };

// ── Active Call Session ──
export interface ActiveCall {
  callId: string;
  callSid: string;
  mode: SessionMode;
  callMode: CallMode;
  sourceLanguage: Language;
  targetLanguage: Language;
  collectedData?: CollectedData;
  status: CallStatus;
  sessionAId: string | null;
  sessionBId: string | null;
  startedAt: number;
  lastActivityAt: number;
}

// ── Twilio Media Stream Events ──
export interface TwilioMediaEvent {
  event: 'media' | 'start' | 'stop' | 'mark';
  sequenceNumber?: string;
  media?: {
    track: string;
    chunk: string;
    timestamp: string;
    payload: string; // base64 g711_ulaw
  };
  start?: {
    streamSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: { encoding: string; sampleRate: number; channels: number };
  };
  stop?: {
    accountSid: string;
    callSid: string;
  };
  streamSid?: string;
}

// ── Transcript Entry ──
export interface TranscriptEntry {
  role: 'user' | 'recipient' | 'ai';
  originalText: string;
  translatedText?: string;
  language: Language;
  timestamp: number;
}

// ── Error Codes ──
export const ErrorCodes = {
  INVALID_MODE: 'INVALID_MODE',
  MISSING_DATA: 'MISSING_DATA',
  UNAUTHORIZED: 'UNAUTHORIZED',
  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  TWILIO_ERROR: 'TWILIO_ERROR',
  OPENAI_ERROR: 'OPENAI_ERROR',
  SESSION_ERROR: 'SESSION_ERROR',
  CALL_LIMIT_EXCEEDED: 'CALL_LIMIT_EXCEEDED',
} as const;
