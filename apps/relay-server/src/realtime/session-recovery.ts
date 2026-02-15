import WebSocket from 'ws';
import type { TranscriptEntry } from '../types.js';
import type { AudioRingBuffer } from './ring-buffer.js';

export interface RecoveryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  heartbeatIntervalMs: number;
  heartbeatTimeoutMs: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRetries: 5,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  heartbeatIntervalMs: 15_000,
  heartbeatTimeoutMs: 5_000,
};

export interface RecoveryEvent {
  timestamp: number;
  session: 'A' | 'B';
  type: 'disconnect' | 'reconnect_attempt' | 'reconnect_success' | 'reconnect_failed' | 'degraded_mode';
  attempt?: number;
  gapMs?: number;
  error?: string;
}

export interface RecoveryCallbacks {
  onRecoveryStart: (session: 'A' | 'B') => void;
  onRecoverySuccess: (session: 'A' | 'B', gapMs: number) => void;
  onRecoveryFailed: (session: 'A' | 'B', error: string) => void;
  onDegradedMode: (session: 'A' | 'B') => void;
}

/**
 * Monitors WebSocket sessions and handles automatic recovery.
 * Uses exponential backoff for reconnection attempts.
 */
export class SessionRecovery {
  private config: RecoveryConfig;
  private callbacks: RecoveryCallbacks;
  private events: RecoveryEvent[] = [];

  // Heartbeat tracking
  private heartbeatTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private lastPong: Map<string, number> = new Map();

  constructor(callbacks: RecoveryCallbacks, config: Partial<RecoveryConfig> = {}) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
    this.callbacks = callbacks;
  }

  /**
   * Start monitoring a WebSocket connection with heartbeat pings.
   */
  startHeartbeat(session: 'A' | 'B', ws: WebSocket) {
    this.stopHeartbeat(session);
    this.lastPong.set(session, Date.now());

    const timer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat(session);
        return;
      }

      const lastPong = this.lastPong.get(session) ?? 0;
      if (Date.now() - lastPong > this.config.heartbeatTimeoutMs + this.config.heartbeatIntervalMs) {
        // Heartbeat timeout — connection is likely dead
        this.logEvent(session, 'disconnect', undefined, undefined, 'Heartbeat timeout');
        this.stopHeartbeat(session);
        this.callbacks.onRecoveryStart(session);
        return;
      }

      // Send ping
      try {
        ws.ping();
      } catch {
        // Ignore ping errors — close event will handle cleanup
      }
    }, this.config.heartbeatIntervalMs);

    this.heartbeatTimers.set(session, timer);

    // Listen for pong responses
    ws.on('pong', () => {
      this.lastPong.set(session, Date.now());
    });
  }

  stopHeartbeat(session: 'A' | 'B') {
    const timer = this.heartbeatTimers.get(session);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(session);
    }
  }

  /**
   * Attempt to reconnect a session with exponential backoff.
   * Returns the new WebSocket if successful, null if all retries failed.
   */
  async attemptReconnect(
    session: 'A' | 'B',
    connectFn: () => Promise<WebSocket>,
    ringBuffer: AudioRingBuffer,
    lastSentSeq: number,
    transcripts: TranscriptEntry[],
  ): Promise<{ ws: WebSocket; gapMs: number } | null> {
    this.callbacks.onRecoveryStart(session);

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      this.logEvent(session, 'reconnect_attempt', attempt);

      const delay = Math.min(
        this.config.baseDelayMs * Math.pow(2, attempt - 1),
        this.config.maxDelayMs,
      );

      await sleep(delay);

      try {
        const ws = await connectFn();
        const gapMs = ringBuffer.getGapMs(lastSentSeq);

        this.logEvent(session, 'reconnect_success', attempt, gapMs);
        this.callbacks.onRecoverySuccess(session, gapMs);

        return { ws, gapMs };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logEvent(session, 'reconnect_attempt', attempt, undefined, errorMsg);
      }
    }

    // All retries exhausted
    this.logEvent(session, 'reconnect_failed');
    this.callbacks.onRecoveryFailed(session, `Failed after ${this.config.maxRetries} attempts`);
    this.callbacks.onDegradedMode(session);
    this.logEvent(session, 'degraded_mode');

    return null;
  }

  private logEvent(
    session: 'A' | 'B',
    type: RecoveryEvent['type'],
    attempt?: number,
    gapMs?: number,
    error?: string,
  ) {
    this.events.push({
      timestamp: Date.now(),
      session,
      type,
      attempt,
      gapMs,
      error,
    });
  }

  getEvents(): RecoveryEvent[] {
    return [...this.events];
  }

  destroy() {
    for (const [session] of this.heartbeatTimers) {
      this.stopHeartbeat(session as 'A' | 'B');
    }
    this.events = [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
