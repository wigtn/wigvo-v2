import type { FastifyInstance } from 'fastify';
import { generateMediaStreamTwiml } from '../twilio/twiml.js';
import { TwilioMediaStreamHandler } from '../twilio/media-stream.js';
import { AudioRouter } from '../realtime/audio-router.js';
import { FirstMessageHandler } from '../realtime/first-message.js';
import { activeCalls, endActiveCall } from './calls.js';

export async function twilioWebhookRoute(app: FastifyInstance) {
  /**
   * POST /relay/twilio/voice — Twilio voice webhook (TwiML)
   * Called by Twilio when the outbound call connects.
   * Returns TwiML to start Media Stream.
   */
  app.post<{ Querystring: { callId?: string } }>('/voice', async (request, reply) => {
    const callId = request.query.callId;

    if (!callId) {
      app.log.error('[TwilioWebhook] No callId in voice webhook');
      reply.status(400).send('Missing callId');
      return;
    }

    app.log.info(`[TwilioWebhook] Voice webhook for call ${callId}`);

    const twiml = generateMediaStreamTwiml(callId);
    reply.type('text/xml').send(twiml);
  });

  /**
   * POST /relay/twilio/status — Twilio status callback
   */
  app.post('/status', async (request, reply) => {
    const body = request.body as Record<string, string>;
    const callSid = body.CallSid;
    const callStatus = body.CallStatus;

    app.log.info(`[TwilioWebhook] Status: ${callSid} → ${callStatus}`);

    // Find call by SID
    for (const [callId, { call }] of activeCalls) {
      if (call.callSid === callSid) {
        switch (callStatus) {
          case 'ringing':
            call.status = 'ringing';
            break;
          case 'in-progress':
            call.status = 'connected';
            break;
          case 'completed':
            await endActiveCall(callId, 'completed');
            break;
          case 'failed':
          case 'canceled':
            await endActiveCall(callId, 'failed');
            break;
          case 'no-answer':
            await endActiveCall(callId, 'no_answer');
            break;
          case 'busy':
            await endActiveCall(callId, 'failed');
            break;
        }
        break;
      }
    }

    reply.status(200).send('OK');
  });

  /**
   * WS /relay/twilio/media-stream — Twilio Media Stream WebSocket
   * Twilio connects here to stream audio from the phone call.
   */
  app.get(
    '/media-stream',
    { websocket: true },
    (socket, request) => {
      app.log.info('[TwilioWebhook] Twilio Media Stream WebSocket connected');

      let callId: string | null = null;
      let audioRouter: AudioRouter | null = null;
      let firstMessageHandler: FirstMessageHandler | null = null;

      const mediaHandler = new TwilioMediaStreamHandler(
        socket,
        // onAudioReceived: Twilio audio → Session B
        (payload, _seq) => {
          if (audioRouter) {
            audioRouter.routeTwilioToSessionB(payload);
          }
        },
        // onStreamStarted
        (streamSid, twilioCallSid) => {
          app.log.info(`[TwilioWebhook] Media stream started: ${streamSid}`);

          // Find the active call by Twilio call SID
          for (const [id, { call, sessionManager }] of activeCalls) {
            if (call.callSid === twilioCallSid) {
              callId = id;
              call.status = 'active';

              // Create audio router
              audioRouter = new AudioRouter(sessionManager, mediaHandler);

              // Setup first message handler
              firstMessageHandler = new FirstMessageHandler(sessionManager, {
                mode: call.mode,
                targetLanguage: call.targetLanguage,
                service: call.collectedData?.service,
              });

              firstMessageHandler.start({
                onComplete: () => {
                  app.log.info(`[TwilioWebhook] First message complete for call ${callId}`);
                },
                onTimeout: () => {
                  app.log.warn(`[TwilioWebhook] Recipient detection timeout for call ${callId}`);
                  if (callId) {
                    endActiveCall(callId, 'no_answer');
                  }
                },
              });

              break;
            }
          }

          if (!callId) {
            app.log.error(`[TwilioWebhook] No active call found for SID: ${twilioCallSid}`);
          }
        },
        // onStreamStopped
        () => {
          app.log.info(`[TwilioWebhook] Media stream stopped for call ${callId}`);
          firstMessageHandler?.cleanup();
          if (callId) {
            endActiveCall(callId, 'completed');
          }
        },
      );
    },
  );
}
