import { useCallback, useRef, useState } from "react";
import { useRelayWebSocket } from "./useRelayWebSocket";
import { useClientVad } from "./useClientVad";
import { useAudioPlayback } from "./useAudioPlayback";
import type { CaptionData, InputMode, WsMessage } from "../lib/types";
import type { VadState } from "../lib/vad/vad-processor";

interface UseRealtimeCallOptions {
  callId: string;
  /** Called when a caption is received */
  onCaption?: (data: CaptionData) => void;
  /** Called when call status changes */
  onCallStatus?: (message: string) => void;
  /** Called on interrupt alert */
  onInterruptAlert?: () => void;
  /** Called on error */
  onError?: (message: string) => void;
  /** Called on recovery status change (PRD 5.3) */
  onRecoveryStatus?: (status: string, message: string) => void;
}

interface UseRealtimeCallReturn {
  /** WebSocket connection status */
  wsStatus: "disconnected" | "connecting" | "connected" | "error";
  /** Current input mode */
  inputMode: InputMode;
  /** Set input mode */
  setInputMode: (mode: InputMode) => void;
  /** Current VAD state (voice mode) */
  vadState: VadState;
  /** Current audio energy level (voice mode) */
  energyLevel: number;
  /** Whether recording is active */
  isRecording: boolean;
  /** Toggle voice recording on/off */
  toggleRecording: () => void;
  /** Send text message */
  sendText: (text: string) => void;
  /** End the call */
  endCall: () => void;
  /** Disconnect WebSocket */
  disconnect: () => void;
}

export function useRealtimeCall({
  callId,
  onCaption,
  onCallStatus,
  onInterruptAlert,
  onError,
  onRecoveryStatus,
}: UseRealtimeCallOptions): UseRealtimeCallReturn {
  const [inputMode, setInputMode] = useState<InputMode>("voice");

  const onCaptionRef = useRef(onCaption);
  onCaptionRef.current = onCaption;
  const onCallStatusRef = useRef(onCallStatus);
  onCallStatusRef.current = onCallStatus;
  const onInterruptAlertRef = useRef(onInterruptAlert);
  onInterruptAlertRef.current = onInterruptAlert;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onRecoveryStatusRef = useRef(onRecoveryStatus);
  onRecoveryStatusRef.current = onRecoveryStatus;

  // Audio playback for recipient translated audio
  const playback = useAudioPlayback();

  // WebSocket message handler
  const handleMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case "caption": {
          const data = msg.data as unknown as CaptionData;
          onCaptionRef.current?.(data);
          break;
        }
        case "recipient_audio": {
          const audio = msg.data.audio as string;
          if (audio) {
            playback.enqueue(audio);
          }
          break;
        }
        case "call_status": {
          const message =
            (msg.data.message as string) ?? (msg.data.status as string);
          onCallStatusRef.current?.(message);
          break;
        }
        case "interrupt_alert": {
          onInterruptAlertRef.current?.();
          // Clear playback queue on interrupt (recipient is speaking)
          playback.clearQueue();
          break;
        }
        case "session.recovery": {
          const status = msg.data.status as string;
          const message = (msg.data.message as string) ?? "";
          onRecoveryStatusRef.current?.(status, message);
          break;
        }
        case "error": {
          const message =
            (msg.data.message as string) ?? "Unknown error";
          onErrorRef.current?.(message);
          break;
        }
      }
    },
    [playback]
  );

  // WebSocket connection
  const ws = useRelayWebSocket({
    callId,
    onMessage: handleMessage,
    autoConnect: true,
  });

  // Client VAD
  const vad = useClientVad({
    onSpeechAudio: (audioBase64) => {
      ws.sendAudioChunk(audioBase64);
    },
    onSpeechCommitted: () => {
      ws.sendVadState("committed");
    },
    enabled: inputMode === "voice",
  });

  const toggleRecording = useCallback(() => {
    if (vad.isRecording) {
      vad.stop();
    } else {
      vad.start();
    }
  }, [vad]);

  const sendText = useCallback(
    (text: string) => {
      ws.sendTextInput(text);
    },
    [ws]
  );

  const endCall = useCallback(() => {
    // Stop recording if active
    if (vad.isRecording) {
      vad.stop();
    }
    // Stop playback
    playback.stop();
    // Send end call
    ws.sendEndCall();
  }, [vad, playback, ws]);

  const handleSetInputMode = useCallback(
    (mode: InputMode) => {
      // Stop recording when switching away from voice
      if (inputMode === "voice" && mode !== "voice" && vad.isRecording) {
        vad.stop();
      }
      setInputMode(mode);
    },
    [inputMode, vad]
  );

  return {
    wsStatus: ws.status,
    inputMode,
    setInputMode: handleSetInputMode,
    vadState: vad.vadState,
    energyLevel: vad.energyLevel,
    isRecording: vad.isRecording,
    toggleRecording,
    sendText,
    endCall,
    disconnect: ws.disconnect,
  };
}
