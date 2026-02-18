'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebAudioRecorder } from '@/lib/audio/web-recorder';

interface UseWebAudioRecorderOptions {
  onChunk: (base64Audio: string) => void;
  /** Also receive raw Float32 samples (for VAD). */
  onRawSamples?: (samples: Float32Array) => void;
  enabled: boolean;
}

interface UseWebAudioRecorderReturn {
  isRecording: boolean;
  isPermissionGranted: boolean;
  start: () => Promise<void>;
  stop: () => void;
  error: string | null;
}

export function useWebAudioRecorder({
  onChunk,
  onRawSamples,
  enabled,
}: UseWebAudioRecorderOptions): UseWebAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<WebAudioRecorder | null>(null);
  const onChunkRef = useRef(onChunk);
  onChunkRef.current = onChunk;
  const onRawSamplesRef = useRef(onRawSamples);
  onRawSamplesRef.current = onRawSamples;

  const start = useCallback(async () => {
    if (recorderRef.current?.recording) return;

    setError(null);

    try {
      const recorder = new WebAudioRecorder();
      recorder.onChunk((base64, float32Samples) => {
        onChunkRef.current(base64);
        onRawSamplesRef.current?.(float32Samples);
      });

      await recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
      setIsPermissionGranted(true);
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission denied'
          : err instanceof Error
            ? err.message
            : 'Failed to start recording';
      setError(message);
      setIsRecording(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (recorderRef.current) {
      recorderRef.current.stop();
      recorderRef.current = null;
    }
    setIsRecording(false);
  }, []);

  // Auto-start/stop based on enabled prop
  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
  }, [enabled, start, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recorderRef.current) {
        recorderRef.current.stop();
        recorderRef.current = null;
      }
    };
  }, []);

  return {
    isRecording,
    isPermissionGranted,
    start,
    stop,
    error,
  };
}
