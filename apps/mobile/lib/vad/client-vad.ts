import type { VadConfig, VadState } from './vad-config';
import { DEFAULT_VAD_CONFIG } from './vad-config';

export interface VadCallbacks {
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onAudioChunk: (pcm16Base64: string) => void;
  onCommit: () => void;
  onStateChange: (state: VadState) => void;
}

/**
 * Client-side VAD (Voice Activity Detection) processor.
 *
 * State machine:
 *   SILENT → (speech detected, 200ms debounce) → SPEAKING
 *   SPEAKING → (silence detected, 500ms) → COMMITTED
 *   COMMITTED → (response received or new speech) → SILENT
 *
 * Pre-speech ring buffer keeps last 300ms of audio so speech onset is not clipped.
 */
export class ClientVad {
  private config: VadConfig;
  private callbacks: VadCallbacks;
  private state: VadState = 'SILENT';

  // Pre-speech ring buffer (circular)
  private preBuffer: Float32Array[] = [];
  private preBufferMaxChunks: number;

  // Timing
  private speechOnsetTimer: ReturnType<typeof setTimeout> | null = null;
  private speechEndTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: VadCallbacks, config: Partial<VadConfig> = {}) {
    this.config = { ...DEFAULT_VAD_CONFIG, ...config };
    this.callbacks = callbacks;

    // Calculate how many chunks fit in preBufferDurationMs
    const msPerChunk = (this.config.chunkSize / this.config.sampleRate) * 1000;
    this.preBufferMaxChunks = Math.ceil(this.config.preBufferDurationMs / msPerChunk);
  }

  /**
   * Process a chunk of raw PCM16 audio samples.
   * Called from the audio recording callback.
   */
  processAudioChunk(samples: Float32Array) {
    const rms = this.calculateRMS(samples);

    switch (this.state) {
      case 'SILENT':
        this.handleSilentState(samples, rms);
        break;
      case 'SPEAKING':
        this.handleSpeakingState(samples, rms);
        break;
      case 'COMMITTED':
        this.handleCommittedState(samples, rms);
        break;
    }
  }

  private handleSilentState(samples: Float32Array, rms: number) {
    // Always maintain pre-speech buffer
    this.pushToPreBuffer(samples);

    if (rms >= this.config.speechThreshold) {
      // Possible speech onset — start debounce
      if (!this.speechOnsetTimer) {
        this.speechOnsetTimer = setTimeout(() => {
          this.transitionTo('SPEAKING');
          this.callbacks.onSpeechStart();

          // Flush pre-buffer (sends the 300ms before speech was confirmed)
          this.flushPreBuffer();
          // Also send the current chunk
          this.sendChunk(samples);

          this.speechOnsetTimer = null;
        }, this.config.speechOnsetDelayMs);
      }
    } else {
      // False alarm — cancel onset timer
      if (this.speechOnsetTimer) {
        clearTimeout(this.speechOnsetTimer);
        this.speechOnsetTimer = null;
      }
    }
  }

  private handleSpeakingState(samples: Float32Array, rms: number) {
    // Stream audio while speaking
    this.sendChunk(samples);

    if (rms <= this.config.silenceThreshold) {
      // Possible speech end — start end timer
      if (!this.speechEndTimer) {
        this.speechEndTimer = setTimeout(() => {
          this.transitionTo('COMMITTED');
          this.callbacks.onSpeechEnd();
          this.callbacks.onCommit();
          this.speechEndTimer = null;
        }, this.config.speechEndDelayMs);
      }
    } else {
      // Still speaking — cancel end timer
      if (this.speechEndTimer) {
        clearTimeout(this.speechEndTimer);
        this.speechEndTimer = null;
      }
    }
  }

  private handleCommittedState(_samples: Float32Array, rms: number) {
    // Waiting for response or new speech
    if (rms >= this.config.speechThreshold) {
      // New speech detected — go back to SILENT to start fresh
      this.transitionTo('SILENT');
    }
  }

  /**
   * Call when the server response is received (turn complete).
   * Transitions from COMMITTED → SILENT.
   */
  notifyResponseReceived() {
    if (this.state === 'COMMITTED') {
      this.transitionTo('SILENT');
    }
  }

  private transitionTo(newState: VadState) {
    this.state = newState;
    this.callbacks.onStateChange(newState);

    if (newState === 'SILENT') {
      this.preBuffer = [];
    }
  }

  private calculateRMS(samples: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  private pushToPreBuffer(samples: Float32Array) {
    this.preBuffer.push(new Float32Array(samples));
    while (this.preBuffer.length > this.preBufferMaxChunks) {
      this.preBuffer.shift();
    }
  }

  private flushPreBuffer() {
    for (const chunk of this.preBuffer) {
      this.sendChunk(chunk);
    }
    this.preBuffer = [];
  }

  private sendChunk(samples: Float32Array) {
    // Convert Float32 → PCM16 → Base64
    const pcm16 = float32ToPcm16(samples);
    const base64 = uint8ArrayToBase64(new Uint8Array(pcm16.buffer));
    this.callbacks.onAudioChunk(base64);
  }

  get currentState(): VadState {
    return this.state;
  }

  destroy() {
    if (this.speechOnsetTimer) clearTimeout(this.speechOnsetTimer);
    if (this.speechEndTimer) clearTimeout(this.speechEndTimer);
    this.preBuffer = [];
  }
}

// ── Audio Conversion Utilities ──

function float32ToPcm16(float32: Float32Array): Int16Array {
  const pcm16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
