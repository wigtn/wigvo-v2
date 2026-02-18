'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WsMessageType, type RelayWsMessage } from '@/shared/call-types';

type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface UseRelayWebSocketOptions {
  url: string | null;
  onMessage: (msg: RelayWsMessage) => void;
  autoConnect: boolean;
}

interface UseRelayWebSocketReturn {
  status: WsStatus;
  sendMessage: (msg: RelayWsMessage) => boolean;
  sendAudioChunk: (base64Audio: string) => boolean;
  sendVadState: (state: string) => boolean;
  sendText: (text: string) => boolean;
  sendEndCall: () => boolean;
  disconnect: () => void;
}

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY_MS = 3000;

export function useRelayWebSocket({
  url,
  onMessage,
  autoConnect,
}: UseRelayWebSocketOptions): UseRelayWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>('disconnected');

  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!url) return;

    cleanup();
    intentionalCloseRef.current = false;
    setStatus('connecting');

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      reconnectCountRef.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as RelayWsMessage;
        onMessageRef.current(msg);
      } catch {
        console.warn('[RelayWS] Failed to parse message:', event.data);
      }
    };

    ws.onerror = () => {
      console.error('[RelayWS] WebSocket error');
    };

    ws.onclose = () => {
      wsRef.current = null;

      if (intentionalCloseRef.current) {
        setStatus('disconnected');
        return;
      }

      if (reconnectCountRef.current < MAX_RECONNECT_ATTEMPTS) {
        reconnectCountRef.current += 1;
        setStatus('connecting');
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, RECONNECT_DELAY_MS);
      } else {
        setStatus('error');
      }
    };
  }, [url, cleanup]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    cleanup();
    setStatus('disconnected');
  }, [cleanup]);

  const sendMessage = useCallback((msg: RelayWsMessage): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
      return true;
    }
    console.warn('[RelayWS] Cannot send, WebSocket not connected');
    return false;
  }, []);

  const sendAudioChunk = useCallback(
    (base64Audio: string): boolean => {
      return sendMessage({ type: WsMessageType.AUDIO_CHUNK, data: { audio: base64Audio } });
    },
    [sendMessage],
  );

  const sendVadState = useCallback(
    (state: string): boolean => {
      return sendMessage({ type: WsMessageType.VAD_STATE, data: { state } });
    },
    [sendMessage],
  );

  const sendText = useCallback(
    (text: string): boolean => {
      return sendMessage({ type: WsMessageType.TEXT_INPUT, data: { text } });
    },
    [sendMessage],
  );

  const sendEndCall = useCallback((): boolean => {
    return sendMessage({ type: WsMessageType.END_CALL, data: {} });
  }, [sendMessage]);

  // Auto-connect when url is set and autoConnect is true
  useEffect(() => {
    if (autoConnect && url) {
      connect();
    }

    return () => {
      cleanup();
    };
  }, [autoConnect, url, connect, cleanup]);

  return {
    status,
    sendMessage,
    sendAudioChunk,
    sendVadState,
    sendText,
    sendEndCall,
    disconnect,
  };
}
