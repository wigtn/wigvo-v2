import type { SessionManager } from './session-manager.js';
import type { Language, SessionMode } from '../types.js';
import { firstMessageTemplates, firstMessageAgentTemplates } from '../prompt/templates.js';

interface FirstMessageConfig {
  mode: SessionMode;
  targetLanguage: Language;
  service?: string;
  recipientDetectionTimeoutMs?: number;
}

/**
 * First Message Strategy (C-3):
 * 1. Wait for recipient to answer (Session B detects speech via Server VAD)
 * 2. Send AI disclosure + greeting via Session A
 * 3. After greeting, enable user input (Relay Mode) or start autonomous conversation (Agent Mode)
 */
export class FirstMessageHandler {
  private recipientDetected = false;
  private firstMessageSent = false;
  private detectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private onComplete: (() => void) | null = null;
  private onTimeout: (() => void) | null = null;

  constructor(
    private sessionManager: SessionManager,
    private config: FirstMessageConfig,
  ) {}

  /**
   * Start waiting for recipient to answer.
   * Returns a promise that resolves when first message sequence is complete.
   */
  start(callbacks: {
    onComplete: () => void;
    onTimeout: () => void;
  }) {
    this.onComplete = callbacks.onComplete;
    this.onTimeout = callbacks.onTimeout;

    // Set timeout for no answer (15 seconds default)
    const timeoutMs = this.config.recipientDetectionTimeoutMs ?? 15_000;
    this.detectionTimeout = setTimeout(() => {
      if (!this.recipientDetected) {
        console.log('[FirstMessage] Recipient detection timeout');
        this.onTimeout?.();
      }
    }, timeoutMs);
  }

  /**
   * Called when Session B detects recipient's first speech (Server VAD).
   */
  handleRecipientDetected() {
    if (this.recipientDetected) return;

    this.recipientDetected = true;
    if (this.detectionTimeout) {
      clearTimeout(this.detectionTimeout);
      this.detectionTimeout = null;
    }

    console.log('[FirstMessage] Recipient detected, sending AI disclosure');
    this.sendFirstMessage();
  }

  /**
   * Called when Session A completes first message TTS.
   */
  handleFirstMessageComplete() {
    if (this.firstMessageSent) return;
    this.firstMessageSent = true;

    console.log('[FirstMessage] First message complete');
    this.onComplete?.();
  }

  private sendFirstMessage() {
    const { mode, targetLanguage, service } = this.config;

    let message: string;

    if (mode === 'agent') {
      message = firstMessageAgentTemplates[targetLanguage]
        .replace('{{service}}', service ?? 'your inquiry');
    } else {
      message = firstMessageTemplates[targetLanguage];
    }

    this.sessionManager.triggerFirstMessage(message);
  }

  cleanup() {
    if (this.detectionTimeout) {
      clearTimeout(this.detectionTimeout);
      this.detectionTimeout = null;
    }
  }
}
