export interface VadConfig {
  /** RMS threshold for speech detection (default: 0.015) */
  speechThreshold: number;
  /** RMS threshold for silence detection (default: 0.008) */
  silenceThreshold: number;
  /** Duration (ms) speech must persist to confirm onset (default: 200) */
  speechOnsetDelayMs: number;
  /** Duration (ms) silence must persist to confirm end (default: 500) */
  speechEndDelayMs: number;
  /** Pre-speech buffer duration in ms (default: 300) */
  preBufferDurationMs: number;
  /** Audio sample rate (default: 16000) */
  sampleRate: number;
  /** Samples per chunk sent via WebSocket (default: 4096 = 256ms @ 16kHz) */
  chunkSize: number;
}

export const DEFAULT_VAD_CONFIG: VadConfig = {
  speechThreshold: parseFloat(process.env.EXPO_PUBLIC_VAD_SPEECH_THRESHOLD ?? '0.015'),
  silenceThreshold: parseFloat(process.env.EXPO_PUBLIC_VAD_SILENCE_THRESHOLD ?? '0.008'),
  speechOnsetDelayMs: parseInt(process.env.EXPO_PUBLIC_VAD_SPEECH_ONSET_DELAY_MS ?? '200', 10),
  speechEndDelayMs: parseInt(process.env.EXPO_PUBLIC_VAD_SPEECH_END_DELAY_MS ?? '500', 10),
  preBufferDurationMs: parseInt(process.env.EXPO_PUBLIC_VAD_PRE_BUFFER_MS ?? '300', 10),
  sampleRate: 16000,
  chunkSize: 4096,
};

export type VadState = 'SILENT' | 'SPEAKING' | 'COMMITTED';
