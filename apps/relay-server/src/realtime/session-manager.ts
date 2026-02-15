import WebSocket from 'ws';
import { config } from '../config.js';
import { createSessionA, type SessionAConfig } from './session-a.js';
import { createSessionB, type SessionBConfig } from './session-b.js';
import type { ActiveCall, Language, SessionMode, CallMode, TranscriptEntry } from '../types.js';

const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview';

export interface SessionManagerCallbacks {
  onTranscriptUser: (text: string, language: Language) => void;
  onTranscriptUserTranslated: (text: string, language: Language) => void;
  onTranscriptRecipient: (text: string, language: Language) => void;
  onTranscriptRecipientTranslated: (text: string, language: Language) => void;
  onAudioForTwilio: (audioBase64: string) => void;
  onAudioForApp: (audioBase64: string) => void;
  onSessionError: (session: 'A' | 'B', error: string) => void;
  onRecipientSpeechStarted: () => void;
  onRecipientSpeechEnded: () => void;
  onFirstMessageComplete: () => void;
}

export class SessionManager {
  private sessionAWs: WebSocket | null = null;
  private sessionBWs: WebSocket | null = null;
  private sessionAId: string | null = null;
  private sessionBId: string | null = null;
  private isFirstMessageSent = false;
  private transcripts: TranscriptEntry[] = [];

  constructor(
    private call: ActiveCall,
    private callbacks: SessionManagerCallbacks,
  ) {}

  async connect(): Promise<{ sessionAId: string; sessionBId: string }> {
    const [sessionA, sessionB] = await Promise.all([
      this.connectSession('A'),
      this.connectSession('B'),
    ]);

    this.sessionAId = sessionA.id;
    this.sessionBId = sessionB.id;

    // Configure sessions
    await this.configureSessionA();
    await this.configureSessionB();

    return {
      sessionAId: this.sessionAId!,
      sessionBId: this.sessionBId!,
    };
  }

  private connectSession(label: 'A' | 'B'): Promise<{ id: string; ws: WebSocket }> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(OPENAI_REALTIME_URL, {
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error(`Session ${label} connection timeout`));
      }, 10_000);

      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`[SessionManager] Session ${label} WebSocket connected`);
      });

      ws.on('message', (data) => {
        const event = JSON.parse(data.toString());

        if (event.type === 'session.created') {
          const id = event.session?.id ?? `session-${label}-${Date.now()}`;
          if (label === 'A') {
            this.sessionAWs = ws;
            this.setupSessionAHandlers(ws);
          } else {
            this.sessionBWs = ws;
            this.setupSessionBHandlers(ws);
          }
          resolve({ id, ws });
        }

        if (event.type === 'error') {
          console.error(`[SessionManager] Session ${label} error:`, event.error);
          this.callbacks.onSessionError(label, event.error?.message ?? 'Unknown error');
        }
      });

      ws.on('error', (err) => {
        clearTimeout(timeout);
        console.error(`[SessionManager] Session ${label} WebSocket error:`, err.message);
        reject(err);
      });

      ws.on('close', (code, reason) => {
        console.log(`[SessionManager] Session ${label} closed: ${code} ${reason}`);
      });
    });
  }

  private async configureSessionA() {
    const sessionConfig = createSessionA({
      mode: this.call.mode,
      callMode: this.call.callMode,
      sourceLanguage: this.call.sourceLanguage,
      targetLanguage: this.call.targetLanguage,
      collectedData: this.call.collectedData,
    });

    this.sendToSessionA({
      type: 'session.update',
      session: sessionConfig,
    });
  }

  private async configureSessionB() {
    const sessionConfig = createSessionB({
      sourceLanguage: this.call.sourceLanguage,
      targetLanguage: this.call.targetLanguage,
    });

    this.sendToSessionB({
      type: 'session.update',
      session: sessionConfig,
    });
  }

  private setupSessionAHandlers(ws: WebSocket) {
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case 'response.audio.delta':
          // Session A audio output → Twilio (수신자에게 전달)
          if (event.delta) {
            this.callbacks.onAudioForTwilio(event.delta);
          }
          break;

        case 'response.audio_transcript.delta':
          // Session A가 생성한 번역 텍스트 (User 발화의 번역)
          if (event.delta) {
            this.callbacks.onTranscriptUserTranslated(
              event.delta,
              this.call.targetLanguage,
            );
          }
          break;

        case 'input_audio_buffer.speech_started':
          // User가 말하기 시작 (Session A에서 감지)
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // User 발화 STT 완료
          if (event.transcript) {
            this.callbacks.onTranscriptUser(event.transcript, this.call.sourceLanguage);
            this.transcripts.push({
              role: 'user',
              originalText: event.transcript,
              language: this.call.sourceLanguage,
              timestamp: Date.now(),
            });
          }
          break;

        case 'response.audio.done':
          // Session A TTS 완료 → first message 완료 체크
          if (!this.isFirstMessageSent) {
            this.isFirstMessageSent = true;
            this.callbacks.onFirstMessageComplete();
          }
          break;

        case 'response.done':
          break;
      }
    });
  }

  private setupSessionBHandlers(ws: WebSocket) {
    ws.on('message', (data) => {
      const event = JSON.parse(data.toString());

      switch (event.type) {
        case 'input_audio_buffer.speech_started':
          // 수신자가 말하기 시작
          this.callbacks.onRecipientSpeechStarted();
          break;

        case 'input_audio_buffer.speech_stopped':
          // 수신자 발화 종료
          this.callbacks.onRecipientSpeechEnded();
          break;

        case 'conversation.item.input_audio_transcription.completed':
          // 수신자 발화 STT 완료 (원어)
          if (event.transcript) {
            this.callbacks.onTranscriptRecipient(event.transcript, this.call.targetLanguage);
            this.transcripts.push({
              role: 'recipient',
              originalText: event.transcript,
              language: this.call.targetLanguage,
              timestamp: Date.now(),
            });
          }
          break;

        case 'response.audio_transcript.delta':
          // 수신자 발화의 번역 텍스트 → User 앱에 자막
          if (event.delta) {
            this.callbacks.onTranscriptRecipientTranslated(
              event.delta,
              this.call.sourceLanguage,
            );
          }
          break;

        case 'response.audio.delta':
          // Session B 번역 음성 → App (사용자에게 번역 오디오)
          if (event.delta) {
            this.callbacks.onAudioForApp(event.delta);
          }
          break;

        case 'response.done':
          break;
      }
    });
  }

  // ── Audio Routing ──

  sendUserAudioToSessionA(audioBase64: string) {
    this.sendToSessionA({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  commitUserAudio() {
    this.sendToSessionA({
      type: 'input_audio_buffer.commit',
    });
    this.sendToSessionA({
      type: 'response.create',
    });
  }

  sendTwilioAudioToSessionB(audioBase64: string) {
    this.sendToSessionB({
      type: 'input_audio_buffer.append',
      audio: audioBase64,
    });
  }

  sendUserTextToSessionA(text: string) {
    this.sendToSessionA({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text }],
      },
    });
    this.sendToSessionA({ type: 'response.create' });

    this.transcripts.push({
      role: 'user',
      originalText: text,
      language: this.call.sourceLanguage,
      timestamp: Date.now(),
    });
  }

  // ── Interrupt ──

  cancelSessionAResponse() {
    this.sendToSessionA({ type: 'response.cancel' });
  }

  // ── First Message ──

  triggerFirstMessage(messageText: string) {
    this.sendToSessionA({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: `[SYSTEM] Say exactly this to the recipient: "${messageText}"` }],
      },
    });
    this.sendToSessionA({ type: 'response.create' });
  }

  // ── Internal ──

  private sendToSessionA(event: Record<string, unknown>) {
    if (this.sessionAWs?.readyState === WebSocket.OPEN) {
      this.sessionAWs.send(JSON.stringify(event));
    }
  }

  private sendToSessionB(event: Record<string, unknown>) {
    if (this.sessionBWs?.readyState === WebSocket.OPEN) {
      this.sessionBWs.send(JSON.stringify(event));
    }
  }

  getTranscripts(): TranscriptEntry[] {
    return [...this.transcripts];
  }

  get sessionIds() {
    return { sessionAId: this.sessionAId, sessionBId: this.sessionBId };
  }

  close() {
    if (this.sessionAWs?.readyState === WebSocket.OPEN) {
      this.sessionAWs.close();
    }
    if (this.sessionBWs?.readyState === WebSocket.OPEN) {
      this.sessionBWs.close();
    }
    this.sessionAWs = null;
    this.sessionBWs = null;
  }
}
