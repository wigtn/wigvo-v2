import { useCallback, useEffect, useRef, useState } from "react";
import { useAudioRecorder } from "./useAudioRecorder";
import { VadProcessor, type VadState } from "../lib/vad/vad-processor";
import { AudioRingBuffer } from "../lib/vad/audio-ring-buffer";
import { VAD_CONFIG } from "../lib/vad/vad-config";

interface UseClientVadOptions {
  /** Called when speech audio should be sent (base64 PCM16 chunks) */
  onSpeechAudio?: (audioBase64: string) => void;
  /** Called when VAD state changes */
  onVadStateChange?: (state: VadState) => void;
  /** Called when speech is committed (user stopped talking) */
  onSpeechCommitted?: () => void;
  /** Whether VAD is enabled */
  enabled?: boolean;
}

interface UseClientVadReturn {
  /** Current VAD state */
  vadState: VadState;
  /** Current audio energy level (0-1) */
  energyLevel: number;
  /** Whether recording is active */
  isRecording: boolean;
  /** Start VAD recording */
  start: () => Promise<void>;
  /** Stop VAD recording */
  stop: () => Promise<void>;
}

export function useClientVad({
  onSpeechAudio,
  onVadStateChange,
  onSpeechCommitted,
  enabled = true,
}: UseClientVadOptions = {}): UseClientVadReturn {
  const [vadState, setVadState] = useState<VadState>("silent");
  const [energyLevel, setEnergyLevel] = useState(0);

  const onSpeechAudioRef = useRef(onSpeechAudio);
  onSpeechAudioRef.current = onSpeechAudio;
  const onVadStateChangeRef = useRef(onVadStateChange);
  onVadStateChangeRef.current = onVadStateChange;
  const onSpeechCommittedRef = useRef(onSpeechCommitted);
  onSpeechCommittedRef.current = onSpeechCommitted;

  const vadRef = useRef(
    new VadProcessor(undefined, (newState, _prevState) => {
      setVadState(newState);
      onVadStateChangeRef.current?.(newState);

      if (newState === "committed") {
        onSpeechCommittedRef.current?.();
        // Auto-reset after commit
        setTimeout(() => {
          vadRef.current.reset();
        }, 50);
      }
    })
  );

  const ringBufferRef = useRef(
    new AudioRingBuffer(
      Math.ceil(VAD_CONFIG.preBufferDuration / VAD_CONFIG.chunkDurationMs)
    )
  );

  // Re-create VAD processor to bind latest callback refs
  useEffect(() => {
    vadRef.current = new VadProcessor(undefined, (newState, _prevState) => {
      setVadState(newState);
      onVadStateChangeRef.current?.(newState);
      if (newState === "committed") {
        onSpeechCommittedRef.current?.();
        setTimeout(() => {
          vadRef.current.reset();
        }, 50);
      }
    });
  }, []);

  const handleChunk = useCallback((audioBase64: string) => {
    // Decode base64 to Int16Array for VAD processing
    const binaryString = atob(audioBase64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const pcm16 = new Int16Array(bytes.buffer);

    // Process through VAD
    const state = vadRef.current.processAudio(pcm16);
    setEnergyLevel(vadRef.current.getRms());

    const ringBuffer = ringBufferRef.current;

    switch (state) {
      case "silent":
        // Buffer audio for pre-speech
        ringBuffer.push(audioBase64);
        break;

      case "speaking":
        // First transition: flush pre-buffer
        if (ringBuffer.length > 0) {
          const preBuffered = ringBuffer.drain();
          for (const chunk of preBuffered) {
            onSpeechAudioRef.current?.(chunk);
          }
        }
        // Send current chunk
        onSpeechAudioRef.current?.(audioBase64);
        break;

      case "committed":
        // The last chunk is still speech
        onSpeechAudioRef.current?.(audioBase64);
        break;
    }
  }, []);

  const recorder = useAudioRecorder({
    onChunk: handleChunk,
    chunkIntervalMs: VAD_CONFIG.chunkDurationMs,
  });

  const start = useCallback(async () => {
    if (!enabled) return;
    vadRef.current.reset();
    ringBufferRef.current.clear();
    setVadState("silent");
    setEnergyLevel(0);
    await recorder.startRecording();
  }, [enabled, recorder]);

  const stop = useCallback(async () => {
    await recorder.stopRecording();
    vadRef.current.reset();
    ringBufferRef.current.clear();
    setVadState("silent");
    setEnergyLevel(0);
  }, [recorder]);

  return {
    vadState,
    energyLevel,
    isRecording: recorder.isRecording,
    start,
    stop,
  };
}
