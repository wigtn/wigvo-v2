import { VAD_CONFIG, type VadConfig } from "./vad-config";

/** VAD states */
export type VadState = "silent" | "speaking" | "committed";

/** Callback for state transitions */
export type VadStateChangeCallback = (
  newState: VadState,
  prevState: VadState
) => void;

/**
 * Client-side VAD processor using RMS energy detection.
 *
 * State machine:
 *   SILENT --(speech detected for speechOnsetDelay)--> SPEAKING
 *   SPEAKING --(silence detected for speechEndDelay)--> COMMITTED
 *   COMMITTED --(reset)--> SILENT
 *   SPEAKING --(cancel)--> SILENT
 */
export class VadProcessor {
  private state: VadState = "silent";
  private config: VadConfig;
  private onStateChange?: VadStateChangeCallback;

  // Timing trackers
  private speechStartTime: number = 0;
  private silenceStartTime: number = 0;
  private currentRms: number = 0;

  constructor(
    config?: Partial<VadConfig>,
    onStateChange?: VadStateChangeCallback
  ) {
    this.config = { ...VAD_CONFIG, ...config };
    this.onStateChange = onStateChange;
  }

  /** Get current VAD state */
  getState(): VadState {
    return this.state;
  }

  /** Get current RMS energy level */
  getRms(): number {
    return this.currentRms;
  }

  /**
   * Process a PCM16 audio chunk and update VAD state.
   * @param pcm16Data - Int16Array of audio samples
   * @returns current state after processing
   */
  processAudio(pcm16Data: Int16Array): VadState {
    const rms = this.calculateRms(pcm16Data);
    this.currentRms = rms;
    const now = Date.now();

    switch (this.state) {
      case "silent":
        if (rms >= this.config.speechThreshold) {
          if (this.speechStartTime === 0) {
            this.speechStartTime = now;
          }
          // Check if speech persisted long enough
          if (now - this.speechStartTime >= this.config.speechOnsetDelay) {
            this.transition("speaking");
            this.silenceStartTime = 0;
          }
        } else {
          // Reset speech timer if energy drops
          this.speechStartTime = 0;
        }
        break;

      case "speaking":
        if (rms < this.config.silenceThreshold) {
          if (this.silenceStartTime === 0) {
            this.silenceStartTime = now;
          }
          // Check if silence persisted long enough
          if (now - this.silenceStartTime >= this.config.speechEndDelay) {
            this.transition("committed");
          }
        } else {
          // Reset silence timer if energy returns
          this.silenceStartTime = 0;
        }
        break;

      case "committed":
        // Stay in committed until explicitly reset
        break;
    }

    return this.state;
  }

  /** Reset to SILENT state (after commit is handled). */
  reset(): void {
    this.transition("silent");
    this.speechStartTime = 0;
    this.silenceStartTime = 0;
    this.currentRms = 0;
  }

  /** Cancel current speech detection and go back to SILENT. */
  cancel(): void {
    if (this.state === "speaking") {
      this.transition("silent");
      this.speechStartTime = 0;
      this.silenceStartTime = 0;
    }
  }

  /** Calculate RMS energy of PCM16 samples (normalized to 0-1). */
  private calculateRms(samples: Int16Array): number {
    if (samples.length === 0) return 0;

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const normalized = samples[i] / 32768; // Normalize Int16 to [-1, 1]
      sumSquares += normalized * normalized;
    }

    return Math.sqrt(sumSquares / samples.length);
  }

  private transition(newState: VadState): void {
    if (newState === this.state) return;
    const prev = this.state;
    this.state = newState;
    this.onStateChange?.(newState, prev);
  }
}
