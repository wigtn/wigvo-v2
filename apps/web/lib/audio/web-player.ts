/**
 * Web Audio API playback engine.
 * Receives base64-encoded PCM16 chunks and plays them sequentially
 * with gapless queue-based playback.
 */

import { base64ToArrayBuffer, pcm16ToFloat32, SAMPLE_RATE } from './pcm16-utils';

export class WebAudioPlayer {
  private audioContext: AudioContext | null = null;
  private queue: string[] = [];
  private currentSource: AudioBufferSourceNode | null = null;
  private isPlayingState = false;
  private nextStartTime = 0;

  /** Whether audio is currently playing or queued. */
  get isPlaying(): boolean {
    return this.isPlayingState;
  }

  /** Enqueue a base64-encoded PCM16 chunk for playback. */
  play(base64Pcm16: string): void {
    this.queue.push(base64Pcm16);
    if (!this.isPlayingState) {
      this.playNext();
    }
  }

  /** Stop current playback and clear the queue. */
  stop(): void {
    this.queue = [];
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        // Already stopped
      }
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    this.isPlayingState = false;
    this.nextStartTime = 0;
  }

  /** Clear queued chunks without stopping current playback. */
  clearQueue(): void {
    this.queue = [];
  }

  /** Release the AudioContext. Call when done with the player. */
  dispose(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    return this.audioContext;
  }

  private async ensureResumed(): Promise<void> {
    const ctx = this.getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  private playNext(): void {
    if (this.queue.length === 0) {
      this.isPlayingState = false;
      this.nextStartTime = 0;
      return;
    }

    this.isPlayingState = true;
    const base64 = this.queue.shift()!;

    const ctx = this.getAudioContext();

    // Safari resume
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => this.scheduleBuffer(ctx, base64));
      return;
    }

    this.scheduleBuffer(ctx, base64);
  }

  private scheduleBuffer(ctx: AudioContext, base64: string): void {
    const pcm16Buffer = base64ToArrayBuffer(base64);
    const rawFloat32 = pcm16ToFloat32(pcm16Buffer);
    // Ensure a proper ArrayBuffer-backed Float32Array for copyToChannel
    const float32 = new Float32Array(rawFloat32);

    const audioBuffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    // Schedule gapless playback
    const startTime = Math.max(ctx.currentTime, this.nextStartTime);
    this.nextStartTime = startTime + audioBuffer.duration;

    source.onended = () => {
      if (this.currentSource === source) {
        this.currentSource = null;
      }
      this.playNext();
    };

    this.currentSource = source;
    source.start(startTime);
  }
}
