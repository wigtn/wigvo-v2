import { twiml as TwiML } from 'twilio';
import { config } from '../config.js';

export function generateMediaStreamTwiml(callId: string): string {
  const response = new TwiML.VoiceResponse();

  const connect = response.connect();
  const stream = connect.stream({
    url: `wss://${new URL(config.twilioWebhookBaseUrl).host}/relay/twilio/media-stream`,
    name: `media-${callId}`,
  });

  stream.parameter({ name: 'callId', value: callId });

  // Pause to keep call alive while streaming
  response.pause({ length: 600 }); // 10 minutes max

  return response.toString();
}
