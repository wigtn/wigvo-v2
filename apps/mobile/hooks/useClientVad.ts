import { useRef, useCallback, useState, useEffect } from 'react';
import { Audio } from 'expo-av';
import { ClientVad } from '../lib/vad/client-vad';
import type { VadState } from '../lib/vad/vad-config';

interface UseClientVadOptions {
  onAudioChunk: (pcm16Base64: string) => void;
  onCommit: () => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  enabled?: boolean;
}

export function useClientVad(options: UseClientVadOptions) {
  const { onAudioChunk, onCommit, onSpeechStart, onSpeechEnd, enabled = true } = options;

  const vadRef = useRef<ClientVad | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [vadState, setVadState] = useState<VadState>('SILENT');
  const [isRecording, setIsRecording] = useState(false);

  // Initialize VAD processor
  useEffect(() => {
    if (!enabled) return;

    vadRef.current = new ClientVad({
      onSpeechStart: () => {
        onSpeechStart?.();
      },
      onSpeechEnd: () => {
        onSpeechEnd?.();
      },
      onAudioChunk,
      onCommit,
      onStateChange: setVadState,
    });

    return () => {
      vadRef.current?.destroy();
      vadRef.current = null;
    };
  }, [enabled]);

  const startRecording = useCallback(async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        console.warn('[useClientVad] Microphone permission denied');
        return;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        {
          isMeteringEnabled: true,
          android: {
            extension: '.wav',
            outputFormat: Audio.AndroidOutputFormat.DEFAULT,
            audioEncoder: Audio.AndroidAudioEncoder.DEFAULT,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 256000,
          },
          ios: {
            extension: '.wav',
            outputFormat: Audio.IOSOutputFormat.LINEARPCM,
            audioQuality: Audio.IOSAudioQuality.HIGH,
            sampleRate: 16000,
            numberOfChannels: 1,
            bitRate: 256000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: 'audio/webm',
            bitsPerSecond: 128000,
          },
        },
        (status) => {
          // Metering callback for VAD energy detection
          if (status.isRecording && status.metering !== undefined) {
            // Convert dB metering to approximate RMS (0-1 range)
            // expo-av metering is in dBFS (-160 to 0)
            const dbfs = status.metering;
            const rms = Math.pow(10, dbfs / 20);

            // Create a synthetic samples array for VAD processing
            const syntheticSamples = new Float32Array(4096);
            syntheticSamples.fill(rms);
            vadRef.current?.processAudioChunk(syntheticSamples);
          }
        },
        100, // Metering interval: 100ms
      );

      recordingRef.current = recording;
      setIsRecording(true);
      console.log('[useClientVad] Recording started');
    } catch (err) {
      console.error('[useClientVad] Failed to start recording:', err);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        recordingRef.current = null;
      }
      setIsRecording(false);
      console.log('[useClientVad] Recording stopped');
    } catch (err) {
      console.error('[useClientVad] Failed to stop recording:', err);
    }
  }, []);

  const notifyResponseReceived = useCallback(() => {
    vadRef.current?.notifyResponseReceived();
  }, []);

  return {
    vadState,
    isRecording,
    startRecording,
    stopRecording,
    notifyResponseReceived,
  };
}
