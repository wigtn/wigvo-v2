/**
 * Client-side VAD configuration (PRD 4.2).
 * RMS-based energy detection parameters.
 */

export const VAD_CONFIG = {
  /** RMS threshold to detect speech start */
  speechThreshold: 0.015,
  /** RMS threshold to detect silence */
  silenceThreshold: 0.008,
  /** Delay before confirming speech onset (ms) */
  speechOnsetDelay: 200,
  /** Delay before confirming speech end (ms) */
  speechEndDelay: 500,
  /** Pre-speech buffer duration (ms) */
  preBufferDuration: 300,
  /** Audio sample rate (Hz) */
  sampleRate: 16000,
  /** Chunk size in samples (256ms @ 16kHz) */
  chunkSize: 4096,
  /** Chunk duration in ms */
  chunkDurationMs: 256,
} as const;

export type VadConfig = typeof VAD_CONFIG;
