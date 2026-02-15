import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import { activeCalls, endActiveCall } from './calls.js';
import { AudioRouter } from '../realtime/audio-router.js';
import { FirstMessageHandler } from '../realtime/first-message.js';
import { checkGuardrail, createGuardrailEvent, getFillerPhrase } from '../guardrail/checker.js';
import { config } from '../config.js';
import type { ClientMessage, ServerMessage } from '../types.js';

export async function streamRoute(app: FastifyInstance) {
  /**
   * WS /relay/calls/:id/stream — Realtime audio/text streaming
   */
  app.get<{ Params: { id: string } }>(
    '/calls/:id/stream',
    { websocket: true },
    (socket, request) => {
      const callId = request.params.id;
      const existing = activeCalls.get(callId);

      if (!existing) {
        sendToClient(socket, {
          type: 'error',
          code: 'CALL_NOT_FOUND',
          message: 'Active call not found',
        });
        socket.close();
        return;
      }

      const { call, sessionManager, ringBuffer, costTracker, guardrailEvents } = existing;
      let audioRouter: AudioRouter | null = null;
      let firstMessageHandler: FirstMessageHandler | null = null;
      let warningTimer: ReturnType<typeof setTimeout> | null = null;
      let idleTimer: ReturnType<typeof setTimeout> | null = null;

      app.log.info(`[Stream] Client connected for call ${callId}`);

      // Notify client of current call status
      sendToClient(socket, { type: 'call.status', status: call.status });

      // ── Setup Session Manager Callbacks ──
      // (Reconnect callbacks to route to this WebSocket client)

      const callbacks = {
        onTranscriptUser: (text: string, language: typeof call.sourceLanguage) => {
          sendToClient(socket, { type: 'transcript.user', text, language, timestamp: Date.now() });
          resetIdleTimer();
        },
        onTranscriptUserTranslated: async (text: string, language: typeof call.targetLanguage) => {
          // Run guardrail check on user's translated text (going to recipient)
          const result = await checkGuardrail(text, language);
          guardrailEvents.push(createGuardrailEvent(result));

          if (result.level === 3 && !result.passed) {
            // Level 3 failed: block transmission, notify user
            sendToClient(socket, {
              type: 'guardrail.triggered',
              level: 3,
              original: text,
            });
            return;
          }

          const finalText = result.correctedText ?? text;
          sendToClient(socket, { type: 'transcript.user.translated', text: finalText, language, timestamp: Date.now() });

          if (result.level >= 2 && result.correctedText) {
            sendToClient(socket, {
              type: 'guardrail.triggered',
              level: result.level,
              original: text,
              corrected: result.correctedText,
            });
          }
        },
        onTranscriptRecipient: (text: string, language: typeof call.targetLanguage) => {
          sendToClient(socket, { type: 'transcript.recipient', text, language, timestamp: Date.now() });
          resetIdleTimer();
        },
        onTranscriptRecipientTranslated: async (text: string, language: typeof call.sourceLanguage) => {
          // Run guardrail on recipient's translated text (going to user)
          const result = await checkGuardrail(text, language);
          guardrailEvents.push(createGuardrailEvent(result));

          const finalText = result.correctedText ?? text;
          sendToClient(socket, { type: 'transcript.recipient.translated', text: finalText, language, timestamp: Date.now() });
        },
        onAudioForTwilio: (audioBase64: string) => {
          ringBuffer.push(audioBase64, 'user');
          audioRouter?.routeSessionAToTwilio(audioBase64);
        },
        onAudioForApp: (audioBase64: string) => {
          sendToClient(socket, { type: 'audio.recipient.translated', audio: audioBase64 });
        },
        onSessionError: (session: 'A' | 'B', error: string) => {
          sendToClient(socket, { type: 'error', code: 'SESSION_ERROR', message: `Session ${session}: ${error}` });
          // Trigger recovery
          sendToClient(socket, { type: 'session.recovery', status: 'recovering', gapMs: 0 });
        },
        onRecipientSpeechStarted: () => {
          audioRouter?.handleRecipientSpeechStart();
          sendToClient(socket, { type: 'interrupt.detected', source: 'recipient' });
          // First message trigger: recipient answered the phone
          firstMessageHandler?.handleRecipientDetected();
        },
        onRecipientSpeechEnded: () => {
          audioRouter?.handleRecipientSpeechEnd();
        },
        onFirstMessageComplete: () => {
          firstMessageHandler?.handleFirstMessageComplete();
        },
      };

      // Patch callbacks into session manager
      // (SessionManager was created with placeholder callbacks in calls.ts,
      //  now we connect the real callbacks via the internal handlers)
      Object.assign((sessionManager as unknown as { callbacks: typeof callbacks }).callbacks, callbacks);

      // ── Setup Call Duration Warning ──
      const elapsed = Date.now() - call.startedAt;
      const warningIn = config.callWarningAtMs - elapsed;
      if (warningIn > 0) {
        warningTimer = setTimeout(() => {
          const remaining = config.maxCallDurationMs - (Date.now() - call.startedAt);
          sendToClient(socket, {
            type: 'call.warning',
            remainingMs: remaining,
            message: `통화 종료까지 ${Math.ceil(remaining / 60_000)}분 남았습니다`,
          });
        }, warningIn);
      }

      // ── Idle Timer ──
      function resetIdleTimer() {
        if (idleTimer) clearTimeout(idleTimer);
        call.lastActivityAt = Date.now();
        idleTimer = setTimeout(() => {
          sendToClient(socket, {
            type: 'call.warning',
            remainingMs: 0,
            message: '30초간 대화가 없었습니다. 통화를 종료할까요?',
          });
        }, config.callIdleTimeoutMs);
      }

      resetIdleTimer();

      // ── Handle Client Messages ──
      socket.on('message', (data: unknown) => {
        try {
          const message: ClientMessage = JSON.parse(
            typeof data === 'string' ? data : (data as Buffer).toString(),
          );

          switch (message.type) {
            case 'audio.chunk':
              // User audio → Session A (voice-to-voice mode)
              ringBuffer.push(message.audio, 'user');
              audioRouter?.routeUserAudioToSessionA(message.audio);
              resetIdleTimer();
              break;

            case 'audio.commit':
              // Client VAD: end of speech
              audioRouter?.commitUserAudio();
              break;

            case 'text.send':
              // Push-to-Talk: text → Session A → TTS → Twilio
              audioRouter?.routeUserTextToSessionA(message.text);
              resetIdleTimer();
              break;

            case 'vad.speech_start':
              // Client VAD notification
              break;

            case 'vad.speech_end':
              // Client VAD notification
              break;

            case 'call.end':
              // User requested call end
              endActiveCall(callId, 'completed');
              sendToClient(socket, { type: 'call.status', status: 'completed' });
              cleanup();
              break;
          }
        } catch (err) {
          app.log.error({ err }, '[Stream] Failed to parse client message');
        }
      });

      socket.on('close', () => {
        app.log.info(`[Stream] Client disconnected for call ${callId}`);
        cleanup();
      });

      socket.on('error', (err: Error) => {
        app.log.error({ err }, `[Stream] WebSocket error for call ${callId}`);
      });

      function cleanup() {
        if (warningTimer) clearTimeout(warningTimer);
        if (idleTimer) clearTimeout(idleTimer);
        firstMessageHandler?.cleanup();
        audioRouter = null;
        firstMessageHandler = null;
      }
    },
  );
}

function sendToClient(ws: WebSocket, message: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}
