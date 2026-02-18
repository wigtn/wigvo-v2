'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WebAudioPlayer } from '@/lib/audio/web-player';

interface UseWebAudioPlayerReturn {
  play: (base64Audio: string) => void;
  stop: () => void;
  clearQueue: () => void;
  isPlaying: boolean;
}

export function useWebAudioPlayer(): UseWebAudioPlayerReturn {
  const [isPlaying, setIsPlaying] = useState(false);
  const playerRef = useRef<WebAudioPlayer | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Lazily initialize player
  const getPlayer = useCallback(() => {
    if (!playerRef.current) {
      playerRef.current = new WebAudioPlayer();
    }
    return playerRef.current;
  }, []);

  // Poll isPlaying state from the player (driven by AudioBufferSourceNode.onended)
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(() => {
      const player = playerRef.current;
      if (player) {
        setIsPlaying(player.isPlaying);
        if (!player.isPlaying && pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      }
    }, 100);
  }, []);

  const play = useCallback(
    (base64Audio: string) => {
      const player = getPlayer();
      player.play(base64Audio);
      setIsPlaying(true);
      startPolling();
    },
    [getPlayer, startPolling]
  );

  const stop = useCallback(() => {
    playerRef.current?.stop();
    setIsPlaying(false);
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const clearQueue = useCallback(() => {
    playerRef.current?.clearQueue();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      playerRef.current?.dispose();
    };
  }, []);

  return {
    play,
    stop,
    clearQueue,
    isPlaying,
  };
}
