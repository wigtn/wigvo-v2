import React, { useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native';
import { LiveCaptionPanel } from './LiveCaptionPanel';
import { PushToTalkInput } from './PushToTalkInput';
import { VadIndicator } from './VadIndicator';
import { ModeSelector } from './ModeSelector';
import { useRealtimeCall } from '../../hooks/useRealtimeCall';

type Language = 'en' | 'ko';
type CallMode = 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text';

interface RealtimeCallViewProps {
  callId: string;
  relayWsUrl: string;
  callMode: CallMode;
  sourceLanguage: Language;
  targetLanguage: Language;
  captionFontSize?: number;
  onCallEnd?: () => void;
  onModeChange?: (mode: CallMode) => void;
}

export function RealtimeCallView({
  callId,
  relayWsUrl,
  callMode,
  sourceLanguage,
  targetLanguage,
  captionFontSize = 16,
  onCallEnd,
  onModeChange,
}: RealtimeCallViewProps) {
  const {
    isConnected,
    callStatus,
    transcripts,
    vadState,
    isRecording,
    isRecipientSpeaking,
    sendText,
    endCall,
  } = useRealtimeCall({
    callId,
    relayWsUrl,
    callMode,
    sourceLanguage,
    targetLanguage,
    onCallEnd,
  });

  const handleEndCall = useCallback(() => {
    Alert.alert(
      '통화 종료',
      '통화를 종료하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: () => {
            endCall();
            onCallEnd?.();
          },
        },
      ],
    );
  }, [endCall, onCallEnd]);

  const isVoiceMode = callMode === 'voice-to-voice';
  const showPushToTalk = callMode === 'chat-to-voice' || callMode === 'voice-to-text';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, isConnected ? styles.statusConnected : styles.statusDisconnected]} />
          <Text style={styles.statusText}>
            {getStatusLabel(callStatus)}
          </Text>
        </View>
        <Text style={styles.modeLabel}>
          {getModeLabel(callMode)}
        </Text>
      </View>

      {/* Mode Selector (before call is active) */}
      {callStatus === 'pending' && onModeChange && (
        <ModeSelector selectedMode={callMode} onModeChange={onModeChange} />
      )}

      {/* VAD Indicator (voice mode) */}
      {isVoiceMode && (
        <VadIndicator state={vadState} isRecording={isRecording} />
      )}

      {/* Recipient speaking indicator */}
      {isRecipientSpeaking && (
        <View style={styles.interruptBanner}>
          <Text style={styles.interruptText}>상대방이 말하고 있습니다</Text>
        </View>
      )}

      {/* Live Captions */}
      <LiveCaptionPanel
        transcripts={transcripts}
        fontSize={captionFontSize}
        sourceLanguage={sourceLanguage}
      />

      {/* Input Area */}
      {showPushToTalk ? (
        <PushToTalkInput
          onSend={sendText}
          disabled={!isConnected || callStatus !== 'active'}
        />
      ) : (
        <View style={styles.voiceModeBar}>
          <Text style={styles.voiceModeText}>
            {callStatus === 'active'
              ? isRecording ? '음성 인식 중...' : '마이크 준비 중...'
              : '통화 연결 중...'}
          </Text>
        </View>
      )}

      {/* End Call Button */}
      <Pressable
        style={styles.endCallButton}
        onPress={handleEndCall}
        accessible
        accessibilityRole="button"
        accessibilityLabel="통화 종료"
        // M-7: 최소 48x48dp
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      >
        <Text style={styles.endCallText}>통화 종료</Text>
      </Pressable>
    </View>
  );
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: '준비 중...',
    calling: '전화 거는 중...',
    ringing: '벨이 울리는 중...',
    connected: '연결됨',
    active: '통화 중',
    ending: '종료 중...',
    completed: '통화 완료',
    failed: '연결 실패',
    no_answer: '응답 없음',
  };
  return labels[status] ?? status;
}

function getModeLabel(mode: CallMode): string {
  const labels: Record<CallMode, string> = {
    'voice-to-voice': 'Voice Translation',
    'chat-to-voice': 'Text to Voice',
    'voice-to-text': 'Voice to Text',
  };
  return labels[mode];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusConnected: {
    backgroundColor: '#4caf50',
  },
  statusDisconnected: {
    backgroundColor: '#f44336',
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
  },
  modeLabel: {
    color: '#8080a0',
    fontSize: 12,
    fontWeight: '500',
  },
  interruptBanner: {
    backgroundColor: '#ff980020',
    padding: 8,
    alignItems: 'center',
  },
  interruptText: {
    color: '#ff9800',
    fontSize: 13,
    fontWeight: '500',
  },
  voiceModeBar: {
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderTopWidth: 1,
    borderTopColor: '#2a2a3e',
    alignItems: 'center',
  },
  voiceModeText: {
    color: '#8080a0',
    fontSize: 14,
  },
  endCallButton: {
    // M-7: 최소 48x48dp
    height: 56,
    margin: 16,
    borderRadius: 28,
    backgroundColor: '#d32f2f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
