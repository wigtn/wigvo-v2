/**
 * Audio ring buffer for pre-speech buffering.
 * Stores the last N audio chunks (base64 encoded PCM16)
 * so they can be prepended when speech is detected.
 */
export class AudioRingBuffer {
  private buffer: string[];
  private capacity: number;
  private writeIndex: number;
  private count: number;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array(capacity).fill("");
    this.writeIndex = 0;
    this.count = 0;
  }

  /** Push a base64 audio chunk into the buffer. */
  push(chunk: string): void {
    this.buffer[this.writeIndex] = chunk;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** Drain all buffered chunks in chronological order and clear. */
  drain(): string[] {
    if (this.count === 0) return [];

    const result: string[] = [];
    // Start from oldest chunk
    const startIndex =
      this.count < this.capacity ? 0 : this.writeIndex;

    for (let i = 0; i < this.count; i++) {
      const idx = (startIndex + i) % this.capacity;
      result.push(this.buffer[idx]);
    }

    this.clear();
    return result;
  }

  /** Clear the buffer. */
  clear(): void {
    this.buffer.fill("");
    this.writeIndex = 0;
    this.count = 0;
  }

  /** Number of chunks currently stored. */
  get length(): number {
    return this.count;
  }
}
