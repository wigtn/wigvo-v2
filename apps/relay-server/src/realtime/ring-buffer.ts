/**
 * Ring Buffer for audio data retention.
 * Keeps the last N seconds of audio for session recovery catch-up.
 */
export class AudioRingBuffer {
  private buffer: AudioChunk[] = [];
  private maxDurationMs: number;
  private sequenceCounter = 0;

  constructor(maxDurationMs = 30_000) {
    this.maxDurationMs = maxDurationMs;
  }

  /**
   * Push an audio chunk into the ring buffer.
   * Automatically evicts old chunks beyond maxDurationMs.
   */
  push(audioBase64: string, source: 'user' | 'twilio'): number {
    const seq = ++this.sequenceCounter;
    const chunk: AudioChunk = {
      seq,
      audioBase64,
      source,
      timestamp: Date.now(),
    };

    this.buffer.push(chunk);
    this.evict();

    return seq;
  }

  /**
   * Get all chunks after a given sequence number (for catch-up after recovery).
   */
  getAfter(lastSequence: number): AudioChunk[] {
    return this.buffer.filter((c) => c.seq > lastSequence);
  }

  /**
   * Get all chunks within a time range.
   */
  getRange(startMs: number, endMs: number): AudioChunk[] {
    return this.buffer.filter(
      (c) => c.timestamp >= startMs && c.timestamp <= endMs,
    );
  }

  /**
   * Get the gap (in ms) between the last sent sequence and newest available.
   */
  getGapMs(lastSentSeq: number): number {
    const unsent = this.getAfter(lastSentSeq);
    if (unsent.length === 0) return 0;
    return Date.now() - unsent[0].timestamp;
  }

  get lastSequence(): number {
    return this.sequenceCounter;
  }

  get size(): number {
    return this.buffer.length;
  }

  clear() {
    this.buffer = [];
  }

  private evict() {
    const cutoff = Date.now() - this.maxDurationMs;
    while (this.buffer.length > 0 && this.buffer[0].timestamp < cutoff) {
      this.buffer.shift();
    }
  }
}

export interface AudioChunk {
  seq: number;
  audioBase64: string;
  source: 'user' | 'twilio';
  timestamp: number;
}
