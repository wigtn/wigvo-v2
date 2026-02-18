'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ClientVAD, type VadState } from '@/lib/audio/vad';
import { useWebAudioRecorder } from './useWebAudioRecorder';

interface UseClientVadOptions {
  /** Called with base64 PCM16 audio during speech. */
  onSpeechAudio: (base64Audio: string) => void;
  /** Called when speech ends (VAD committed). */
  onSpeechCommitted: () => void;
  /** Whether VAD is enabled. */
  enabled: boolean;
}

interface UseClientVadReturn {
  isSpeaking: boolean;
}

export function useClientVad({
  onSpeechAudio,
  onSpeechCommitted,
  enabled,
}: UseClientVadOptions): UseClientVadReturn {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const onSpeechAudioRef = useRef(onSpeechAudio);
  onSpeechAudioRef.current = onSpeechAudio;
  const onSpeechCommittedRef = useRef(onSpeechCommitted);
  onSpeechCommittedRef.current = onSpeechCommitted;

  // Pre-speech ring buffer: keeps last N chunks for smooth onset
  const PRE_BUFFER_CHUNKS = 3; // ~300ms at 100ms/chunk
  const preBufferRef = useRef<string[]>([]);

  const vadRef = useRef<ClientVAD>(
    new ClientVAD(undefined, {
      onSpeechStart: () => {
        setIsSpeaking(true);
        // Flush pre-buffer
        const buffered = preBufferRef.current;
        preBufferRef.current = [];
        for (const chunk of buffered) {
          onSpeechAudioRef.current(chunk);
        }
      },
      onCommitted: () => {
        setIsSpeaking(false);
        onSpeechCommittedRef.current();
        // Auto-reset after commit
        setTimeout(() => {
          vadRef.current.reset();
        }, 50);
      },
    })
  );

  const handleChunk = useCallback((base64Audio: string) => {
    // This is called by the recorder with the base64 chunk
    const state = vadRef.current.getState();

    if (state === 'speech' || state === 'committed') {
      // Already speaking, send directly
      onSpeechAudioRef.current(base64Audio);
    } else {
      // Silence: buffer for pre-speech
      const buf = preBufferRef.current;
      buf.push(base64Audio);
      if (buf.length > PRE_BUFFER_CHUNKS) {
        buf.shift();
      }
    }
  }, []);

  const handleRawSamples = useCallback((samples: Float32Array) => {
    vadRef.current.processSamples(samples);
  }, []);

  // Reset VAD when disabled
  useEffect(() => {
    if (!enabled) {
      vadRef.current.reset();
      preBufferRef.current = [];
      setIsSpeaking(false);
    }
  }, [enabled]);

  useWebAudioRecorder({
    onChunk: handleChunk,
    onRawSamples: handleRawSamples,
    enabled,
  });

  return {
    isSpeaking,
  };
}
