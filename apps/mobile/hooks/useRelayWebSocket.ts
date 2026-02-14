import { useCallback, useEffect, useRef, useState } from "react";
import { WsMessage, WsMessageType } from "../lib/types";
import { RELAY_WS_URL } from "../lib/constants";

export type WsStatus = "disconnected" | "connecting" | "connected" | "error";

type MessageHandler = (msg: WsMessage) => void;

interface UseRelayWebSocketOptions {
  callId: string | null;
  onMessage?: MessageHandler;
  onStatusChange?: (status: WsStatus) => void;
  autoConnect?: boolean;
}

interface UseRelayWebSocketReturn {
  status: WsStatus;
  connect: () => void;
  disconnect: () => void;
  sendAudioChunk: (audioBase64: string) => void;
  sendTextInput: (text: string) => void;
  sendVadState: (state: string) => void;
  sendEndCall: () => void;
}

export function useRelayWebSocket({
  callId,
  onMessage,
  onStatusChange,
  autoConnect = false,
}: UseRelayWebSocketOptions): UseRelayWebSocketReturn {
  const [status, setStatus] = useState<WsStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onStatusChangeRef = useRef(onStatusChange);

  // Keep refs in sync
  onMessageRef.current = onMessage;
  onStatusChangeRef.current = onStatusChange;

  const updateStatus = useCallback((newStatus: WsStatus) => {
    setStatus(newStatus);
    onStatusChangeRef.current?.(newStatus);
  }, []);

  const sendMessage = useCallback((type: WsMessageType, data: Record<string, unknown> = {}) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, data }));
    }
  }, []);

  const connect = useCallback(() => {
    if (!callId) return;
    if (wsRef.current) {
      wsRef.current.close();
    }

    const url = `${RELAY_WS_URL}/relay/calls/${callId}/stream`;
    updateStatus("connecting");

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      updateStatus("connected");
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        onMessageRef.current?.(msg);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      updateStatus("error");
    };

    ws.onclose = () => {
      updateStatus("disconnected");
      wsRef.current = null;
    };
  }, [callId, updateStatus]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // Auto-connect when callId changes (if enabled)
  useEffect(() => {
    if (autoConnect && callId) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [callId, autoConnect, connect, disconnect]);

  const sendAudioChunk = useCallback(
    (audioBase64: string) => {
      sendMessage("audio_chunk", { audio: audioBase64 });
    },
    [sendMessage]
  );

  const sendTextInput = useCallback(
    (text: string) => {
      sendMessage("text_input", { text });
    },
    [sendMessage]
  );

  const sendVadState = useCallback(
    (state: string) => {
      sendMessage("vad_state", { state });
    },
    [sendMessage]
  );

  const sendEndCall = useCallback(() => {
    sendMessage("end_call");
  }, [sendMessage]);

  return {
    status,
    connect,
    disconnect,
    sendAudioChunk,
    sendTextInput,
    sendVadState,
    sendEndCall,
  };
}
