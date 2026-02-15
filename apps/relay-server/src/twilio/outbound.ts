import Twilio from 'twilio';
import { config } from '../config.js';

const client = Twilio(config.twilioAccountSid, config.twilioAuthToken);

interface OutboundCallParams {
  to: string;
  callId: string;
}

export async function initiateOutboundCall({ to, callId }: OutboundCallParams) {
  const webhookUrl = `${config.twilioWebhookBaseUrl}/relay/twilio/voice`;
  const statusCallbackUrl = `${config.twilioWebhookBaseUrl}/relay/twilio/status`;

  const call = await client.calls.create({
    to,
    from: config.twilioPhoneNumber,
    url: `${webhookUrl}?callId=${encodeURIComponent(callId)}`,
    statusCallback: statusCallbackUrl,
    statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
    statusCallbackMethod: 'POST',
    machineDetection: 'Enable',
    timeout: 30,
  });

  return {
    callSid: call.sid,
    status: call.status,
  };
}

export async function endCall(callSid: string) {
  await client.calls(callSid).update({ status: 'completed' });
}
