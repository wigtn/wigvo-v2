import type { SessionManager } from './session-manager.js';
import type { TwilioMediaStreamHandler } from '../twilio/media-stream.js';

/**
 * AudioRouter: Bidirectional audio routing between Twilio and OpenAI Realtime API.
 *
 * Flow:
 *   App (User audio) → SessionManager → Session A → [TTS] → Twilio → Recipient
 *   Twilio (Recipient audio) → SessionManager → Session B → [STT+Translate] → App
 */
export class AudioRouter {
  private isRecipientSpeaking = false;
  private isSessionATTSActive = false;

  constructor(
    private sessionManager: SessionManager,
    private twilioHandler: TwilioMediaStreamHandler,
  ) {}

  /**
   * Route audio from Twilio (recipient) to OpenAI Session B
   */
  routeTwilioToSessionB(audioPayload: string) {
    this.sessionManager.sendTwilioAudioToSessionB(audioPayload);
  }

  /**
   * Route audio from Session A (translated TTS) to Twilio
   */
  routeSessionAToTwilio(audioBase64: string) {
    this.isSessionATTSActive = true;
    this.twilioHandler.sendAudio(audioBase64);
  }

  /**
   * Route user audio from App to Session A
   */
  routeUserAudioToSessionA(audioBase64: string) {
    this.sessionManager.sendUserAudioToSessionA(audioBase64);
  }

  /**
   * Commit user audio (end of speech from client VAD)
   */
  commitUserAudio() {
    this.sessionManager.commitUserAudio();
  }

  /**
   * Route user text (Push-to-Talk) to Session A
   */
  routeUserTextToSessionA(text: string) {
    this.sessionManager.sendUserTextToSessionA(text);
  }

  // ── Interrupt Handling ──

  /**
   * Handle recipient speech start (interrupt priority: recipient > user > AI)
   * Case 1: If Session A TTS is playing, cancel it
   */
  handleRecipientSpeechStart() {
    this.isRecipientSpeaking = true;

    if (this.isSessionATTSActive) {
      // Cancel Session A TTS output (recipient interrupts)
      this.sessionManager.cancelSessionAResponse();
      // Clear pending audio in Twilio stream
      this.twilioHandler.clearAudio();
      this.isSessionATTSActive = false;
    }
  }

  handleRecipientSpeechEnd() {
    this.isRecipientSpeaking = false;
  }

  handleSessionATTSComplete() {
    this.isSessionATTSActive = false;
  }

  get recipientSpeaking(): boolean {
    return this.isRecipientSpeaking;
  }

  get sessionATTSActive(): boolean {
    return this.isSessionATTSActive;
  }
}
