import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { initiateOutboundCall } from '../twilio/outbound.js';
import { SessionManager } from '../realtime/session-manager.js';
import { AudioRingBuffer } from '../realtime/ring-buffer.js';
import { SessionRecovery } from '../realtime/session-recovery.js';
import { CostTracker } from '../db/cost-tracker.js';
import { saveCallResult, createCallRecord } from '../db/call-repository.js';
import { ErrorCodes } from '../types.js';
import type { CallStartRequest, CallStartResponse, ActiveCall, CallMode, SessionMode } from '../types.js';
import type { GuardrailEvent } from '../guardrail/checker.js';

// Store active calls (shared with server.ts)
export const activeCalls = new Map<string, {
  call: ActiveCall;
  sessionManager: SessionManager;
  ringBuffer: AudioRingBuffer;
  recovery: SessionRecovery;
  costTracker: CostTracker;
  guardrailEvents: GuardrailEvent[];
}>();

const VALID_MODES: SessionMode[] = ['relay', 'agent'];
const VALID_CALL_MODES: CallMode[] = ['voice-to-voice', 'chat-to-voice', 'voice-to-text'];

export async function callsRoute(app: FastifyInstance) {
  /**
   * POST /relay/calls/start — Start a call with Dual Session
   */
  app.post<{ Body: CallStartRequest }>('/calls/start', async (request, reply) => {
    const { callId, mode, callMode, sourceLanguage, targetLanguage, collectedData } = request.body;

    // Validation
    if (!callId) {
      return reply.status(400).send({
        success: false,
        error: { code: ErrorCodes.MISSING_DATA, message: 'callId is required' },
      });
    }

    if (!VALID_MODES.includes(mode)) {
      return reply.status(400).send({
        success: false,
        error: { code: ErrorCodes.INVALID_MODE, message: `Invalid mode: ${mode}` },
      });
    }

    if (!VALID_CALL_MODES.includes(callMode)) {
      return reply.status(400).send({
        success: false,
        error: { code: ErrorCodes.INVALID_MODE, message: `Invalid callMode: ${callMode}` },
      });
    }

    if (mode === 'agent' && !collectedData) {
      return reply.status(400).send({
        success: false,
        error: { code: ErrorCodes.MISSING_DATA, message: 'collectedData is required for agent mode' },
      });
    }

    // Feature flag check
    if (config.callMode !== 'realtime') {
      return reply.status(400).send({
        success: false,
        error: { code: ErrorCodes.INVALID_MODE, message: 'Realtime mode is not enabled. Set CALL_MODE=realtime' },
      });
    }

    const phone = collectedData?.details?.phone ?? collectedData?.targetPhone;
    if (!phone) {
      return reply.status(400).send({
        success: false,
        error: { code: ErrorCodes.MISSING_DATA, message: 'Target phone number is required' },
      });
    }

    try {
      // 1. Create active call record
      const activeCall: ActiveCall = {
        callId,
        callSid: '',
        mode,
        callMode,
        sourceLanguage,
        targetLanguage,
        collectedData,
        status: 'pending',
        sessionAId: null,
        sessionBId: null,
        startedAt: Date.now(),
        lastActivityAt: Date.now(),
      };

      // 2. Create OpenAI Realtime Dual Sessions
      const sessionManager = new SessionManager(activeCall, {
        onTranscriptUser: () => {},
        onTranscriptUserTranslated: () => {},
        onTranscriptRecipient: () => {},
        onTranscriptRecipientTranslated: () => {},
        onAudioForTwilio: () => {},
        onAudioForApp: () => {},
        onSessionError: (session, error) => {
          app.log.error(`Session ${session} error: ${error}`);
        },
        onRecipientSpeechStarted: () => {},
        onRecipientSpeechEnded: () => {},
        onFirstMessageComplete: () => {},
      });

      const { sessionAId, sessionBId } = await sessionManager.connect();
      activeCall.sessionAId = sessionAId;
      activeCall.sessionBId = sessionBId;

      // 3. Create ring buffer and recovery system
      const ringBuffer = new AudioRingBuffer(30_000);
      const recovery = new SessionRecovery({
        onRecoveryStart: (session) => {
          app.log.warn(`[Recovery] Session ${session} recovery started for call ${callId}`);
        },
        onRecoverySuccess: (session, gapMs) => {
          app.log.info(`[Recovery] Session ${session} recovered, gap: ${gapMs}ms`);
        },
        onRecoveryFailed: (session, error) => {
          app.log.error(`[Recovery] Session ${session} failed: ${error}`);
        },
        onDegradedMode: (session) => {
          app.log.warn(`[Recovery] Session ${session} entering degraded mode`);
        },
      });
      const costTracker = new CostTracker();

      // 4. Initiate Twilio outbound call
      const { callSid } = await initiateOutboundCall({ to: phone, callId });
      activeCall.callSid = callSid;
      activeCall.status = 'calling';

      // 5. Store active call
      activeCalls.set(callId, {
        call: activeCall,
        sessionManager,
        ringBuffer,
        recovery,
        costTracker,
        guardrailEvents: [],
      });

      // 6. Save to DB
      await createCallRecord({
        id: callId,
        user_id: 'system', // TODO: extract from auth
        call_mode: callMode,
        source_language: sourceLanguage,
        target_language: targetLanguage,
        twilio_call_sid: callSid,
        vad_mode: callMode === 'chat-to-voice' ? 'push-to-talk' : 'client',
      });

      // 6. Set call duration limits
      setupCallTimers(callId, activeCall);

      const wsHost = new URL(config.twilioWebhookBaseUrl).host;
      const relayWsUrl = `wss://${wsHost}/relay/calls/${callId}/stream`;

      const response: CallStartResponse = {
        success: true,
        data: {
          callSid,
          sessionA: { id: sessionAId, status: 'connected' },
          sessionB: { id: sessionBId, status: 'connected' },
          relayWsUrl,
          mode,
          callMode,
        },
      };

      return reply.status(200).send(response);
    } catch (err) {
      app.log.error({ err }, 'Failed to start call');

      // Cleanup on failure
      const existing = activeCalls.get(callId);
      if (existing) {
        existing.sessionManager.close();
        activeCalls.delete(callId);
      }

      const isOpenAIError = (err as Error).message?.includes('Session');
      return reply.status(502).send({
        success: false,
        error: {
          code: isOpenAIError ? ErrorCodes.OPENAI_ERROR : ErrorCodes.TWILIO_ERROR,
          message: (err as Error).message,
        },
      });
    }
  });

  /**
   * POST /relay/calls/:id/end — End a call
   */
  app.post<{ Params: { id: string } }>('/calls/:id/end', async (request, reply) => {
    const { id: callId } = request.params;
    const existing = activeCalls.get(callId);

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: ErrorCodes.CALL_NOT_FOUND, message: 'Active call not found' },
      });
    }

    await endActiveCall(callId, 'completed');

    return reply.status(200).send({ success: true });
  });
}

// ── Call Duration Timers ──

function setupCallTimers(callId: string, call: ActiveCall) {
  // Warning at 8 minutes
  setTimeout(() => {
    const existing = activeCalls.get(callId);
    if (!existing) return;
    // Will be sent via WebSocket stream route
    existing.call.lastActivityAt = Date.now();
  }, config.callWarningAtMs);

  // Auto-end at 10 minutes
  setTimeout(() => {
    const existing = activeCalls.get(callId);
    if (!existing) return;
    console.log(`[CallTimer] Call ${callId} exceeded max duration, auto-ending`);
    endActiveCall(callId, 'completed');
  }, config.maxCallDurationMs);
}

export async function endActiveCall(callId: string, status: 'completed' | 'failed' | 'no_answer') {
  const existing = activeCalls.get(callId);
  if (!existing) return;

  const { call, sessionManager, ringBuffer, recovery, costTracker, guardrailEvents } = existing;

  // Get transcripts before closing
  const transcripts = sessionManager.getTranscripts();
  const durationSeconds = Math.round((Date.now() - call.startedAt) / 1000);

  // Close sessions and cleanup
  sessionManager.close();
  recovery.destroy();
  ringBuffer.clear();

  // End Twilio call if still active
  if (call.callSid) {
    try {
      const { endCall } = await import('../twilio/outbound.js');
      await endCall(call.callSid);
    } catch {
      // Call may already be ended
    }
  }

  // Save to DB with all tracking data
  await saveCallResult(callId, {
    status,
    duration_seconds: durationSeconds,
    transcript_bilingual: transcripts,
    cost_tokens: costTracker.getTokens(),
    guardrail_events: guardrailEvents,
    recovery_events: recovery.getEvents(),
    session_a_id: call.sessionAId,
    session_b_id: call.sessionBId,
  });

  // Remove from active calls
  activeCalls.delete(callId);

  console.log(`[CallManager] Call ${callId} ended with status: ${status}, duration: ${durationSeconds}s`);
}
