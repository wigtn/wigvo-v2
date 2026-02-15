import type { WebSocket } from 'ws';
import type { TwilioMediaEvent } from '../types.js';

export class TwilioMediaStreamHandler {
  private streamSid: string | null = null;
  private callSid: string | null = null;
  private callId: string | null = null;

  constructor(
    private ws: WebSocket,
    private onAudioReceived: (payload: string, sequenceNumber: number) => void,
    private onStreamStarted: (streamSid: string, callSid: string) => void,
    private onStreamStopped: () => void,
  ) {
    this.ws.on('message', (data) => this.handleMessage(data));
    this.ws.on('close', () => this.onStreamStopped());
    this.ws.on('error', (err) => {
      console.error('[TwilioMediaStream] WebSocket error:', err.message);
    });
  }

  private handleMessage(data: unknown) {
    try {
      const event: TwilioMediaEvent = JSON.parse(
        typeof data === 'string' ? data : (data as Buffer).toString(),
      );

      switch (event.event) {
        case 'start':
          this.streamSid = event.start!.streamSid;
          this.callSid = event.start!.callSid;
          console.log(`[TwilioMediaStream] Stream started: ${this.streamSid}`);
          this.onStreamStarted(this.streamSid!, this.callSid!);
          break;

        case 'media':
          if (event.media?.payload) {
            const seq = parseInt(event.sequenceNumber ?? '0', 10);
            this.onAudioReceived(event.media.payload, seq);
          }
          break;

        case 'stop':
          console.log(`[TwilioMediaStream] Stream stopped: ${this.streamSid}`);
          this.onStreamStopped();
          break;

        case 'mark':
          // Mark events for tracking audio playback completion
          break;
      }
    } catch (err) {
      console.error('[TwilioMediaStream] Failed to parse message:', err);
    }
  }

  sendAudio(payload: string) {
    if (this.ws.readyState !== this.ws.OPEN || !this.streamSid) return;

    this.ws.send(
      JSON.stringify({
        event: 'media',
        streamSid: this.streamSid,
        media: { payload },
      }),
    );
  }

  sendMark(name: string) {
    if (this.ws.readyState !== this.ws.OPEN || !this.streamSid) return;

    this.ws.send(
      JSON.stringify({
        event: 'mark',
        streamSid: this.streamSid,
        mark: { name },
      }),
    );
  }

  clearAudio() {
    if (this.ws.readyState !== this.ws.OPEN || !this.streamSid) return;

    this.ws.send(
      JSON.stringify({
        event: 'clear',
        streamSid: this.streamSid,
      }),
    );
  }

  close() {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.close();
    }
  }

  get isConnected(): boolean {
    return this.ws.readyState === this.ws.OPEN;
  }

  get currentStreamSid(): string | null {
    return this.streamSid;
  }
}
