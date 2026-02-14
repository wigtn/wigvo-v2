import { useCallback, useRef } from "react";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Hook for playing back recipient's translated audio.
 * Receives base64 PCM16 chunks and plays them sequentially.
 */
export function useAudioPlayback() {
  const queueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const playNext = useCallback(async () => {
    if (isPlayingRef.current || queueRef.current.length === 0) return;
    isPlayingRef.current = true;

    const audioBase64 = queueRef.current.shift()!;

    try {
      // Create a WAV file from PCM16 base64 data
      const wavBase64 = createWavBase64(audioBase64, 16000, 1, 16);
      const uri = FileSystem.cacheDirectory + `playback_${Date.now()}.wav`;
      await FileSystem.writeAsStringAsync(uri, wavBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Unload previous sound
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: true }
      );
      soundRef.current = sound;

      // Listen for playback completion
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          isPlayingRef.current = false;
          // Clean up
          FileSystem.deleteAsync(uri, { idempotent: true });
          sound.unloadAsync();
          // Play next in queue
          playNext();
        }
      });
    } catch (error) {
      console.error("Playback error:", error);
      isPlayingRef.current = false;
      // Try next
      playNext();
    }
  }, []);

  const enqueue = useCallback(
    (audioBase64: string) => {
      queueRef.current.push(audioBase64);
      playNext();
    },
    [playNext]
  );

  const stop = useCallback(async () => {
    queueRef.current = [];
    isPlayingRef.current = false;
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // Ignore
      }
      soundRef.current = null;
    }
  }, []);

  const clearQueue = useCallback(() => {
    queueRef.current = [];
  }, []);

  return {
    enqueue,
    stop,
    clearQueue,
  };
}

/**
 * Create a WAV file header + data from raw PCM16 base64.
 * Returns complete WAV file as base64.
 */
function createWavBase64(
  pcmBase64: string,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number
): string {
  // Decode PCM base64 to byte array
  const pcmBytes = Uint8Array.from(atob(pcmBase64), (c) => c.charCodeAt(0));
  const dataSize = pcmBytes.length;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);

  // Create WAV header (44 bytes)
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // "RIFF"
  view.setUint8(0, 0x52); view.setUint8(1, 0x49);
  view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  // File size - 8
  view.setUint32(4, 36 + dataSize, true);
  // "WAVE"
  view.setUint8(8, 0x57); view.setUint8(9, 0x41);
  view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // "fmt "
  view.setUint8(12, 0x66); view.setUint8(13, 0x6d);
  view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  // Chunk size
  view.setUint32(16, 16, true);
  // Audio format (PCM = 1)
  view.setUint16(20, 1, true);
  // Num channels
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate
  view.setUint32(28, byteRate, true);
  // Block align
  view.setUint16(32, blockAlign, true);
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  // "data"
  view.setUint8(36, 0x64); view.setUint8(37, 0x61);
  view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  // Data size
  view.setUint32(40, dataSize, true);

  // Combine header + PCM data
  const wav = new Uint8Array(44 + dataSize);
  wav.set(new Uint8Array(header), 0);
  wav.set(pcmBytes, 44);

  // Convert to base64
  let binary = "";
  for (let i = 0; i < wav.length; i++) {
    binary += String.fromCharCode(wav[i]);
  }
  return btoa(binary);
}
