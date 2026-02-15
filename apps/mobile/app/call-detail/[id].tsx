import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '../../lib/supabase/client';

interface CallDetail {
  id: string;
  status: string;
  call_mode: string;
  source_language: string;
  target_language: string;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  transcript_bilingual: TranscriptEntry[] | null;
  cost_tokens: CostTokens | null;
}

interface TranscriptEntry {
  role: string;
  originalText: string;
  translatedText?: string;
  language: string;
  timestamp: number;
}

interface CostTokens {
  session_a_input: number;
  session_a_output: number;
  session_b_input: number;
  session_b_output: number;
  guardrail_tokens: number;
}

const MODE_LABELS: Record<string, string> = {
  'voice-to-voice': '음성 번역',
  'chat-to-voice': '대리 통화',
  'voice-to-text': '음성 → 자막',
};

export default function CallDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data, error } = await supabase
          .from('calls')
          .select('*')
          .eq('id', id)
          .single();

        if (error) throw error;
        setCall(data);
      } catch (err) {
        console.error('[CallDetail] Failed to load:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4a90d9" />
      </View>
    );
  }

  if (!call) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>통화 기록을 찾을 수 없습니다</Text>
      </View>
    );
  }

  const startDate = new Date(call.started_at);
  const modeLabel = MODE_LABELS[call.call_mode] ?? call.call_mode;
  const langPair = `${(call.source_language ?? 'en').toUpperCase()} → ${(call.target_language ?? 'ko').toUpperCase()}`;
  const duration = call.duration_seconds
    ? `${Math.floor(call.duration_seconds / 60)}분 ${call.duration_seconds % 60}초`
    : '-';

  const transcripts = call.transcript_bilingual ?? [];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Call Info */}
      <View style={styles.infoCard}>
        <Text style={styles.modeLabel}>{modeLabel}</Text>
        <Text style={styles.langPair}>{langPair}</Text>
        <View style={styles.infoGrid}>
          <InfoItem label="날짜" value={`${startDate.getFullYear()}.${startDate.getMonth() + 1}.${startDate.getDate()}`} />
          <InfoItem label="시간" value={`${startDate.getHours().toString().padStart(2, '0')}:${startDate.getMinutes().toString().padStart(2, '0')}`} />
          <InfoItem label="통화 시간" value={duration} />
          <InfoItem label="상태" value={call.status === 'completed' ? '완료' : call.status} />
        </View>
      </View>

      {/* Transcripts */}
      <Text style={styles.sectionTitle}>대화 내용</Text>
      {transcripts.length === 0 ? (
        <View style={styles.emptyTranscripts}>
          <Text style={styles.emptyText}>대화 기록이 없습니다</Text>
        </View>
      ) : (
        <View style={styles.transcriptList}>
          {transcripts.map((t, idx) => (
            <TranscriptItem key={idx} entry={t} />
          ))}
        </View>
      )}

      {/* Cost Info */}
      {call.cost_tokens && (
        <>
          <Text style={styles.sectionTitle}>사용량</Text>
          <View style={styles.infoCard}>
            <InfoItem
              label="총 토큰"
              value={String(
                (call.cost_tokens.session_a_input ?? 0) +
                (call.cost_tokens.session_a_output ?? 0) +
                (call.cost_tokens.session_b_input ?? 0) +
                (call.cost_tokens.session_b_output ?? 0) +
                (call.cost_tokens.guardrail_tokens ?? 0)
              )}
            />
          </View>
        </>
      )}
    </ScrollView>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function TranscriptItem({ entry }: { entry: TranscriptEntry }) {
  const isUser = entry.role === 'user';
  const roleLabel = isUser ? '나' : entry.role === 'recipient' ? '상대방' : 'AI';

  return (
    <View
      style={[styles.transcriptBubble, isUser ? styles.userBubble : styles.recipientBubble]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${roleLabel}: ${entry.translatedText ?? entry.originalText}`}
    >
      <Text style={[styles.roleTag, isUser ? styles.userTag : styles.recipientTag]}>
        {roleLabel}
      </Text>
      {entry.translatedText && (
        <Text style={styles.translatedText}>{entry.translatedText}</Text>
      )}
      <Text style={[styles.originalText, entry.translatedText ? styles.originalSmall : null]}>
        {entry.originalText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f0f23',
  },
  errorText: {
    color: '#8080a0',
    fontSize: 16,
  },
  infoCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    marginBottom: 24,
  },
  modeLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  langPair: {
    fontSize: 14,
    color: '#4a90d9',
    fontWeight: '500',
    marginBottom: 16,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  infoItem: {
    minWidth: '40%',
  },
  infoLabel: {
    fontSize: 12,
    color: '#8080a0',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 12,
  },
  emptyTranscripts: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#606080',
    fontSize: 14,
  },
  transcriptList: {
    gap: 8,
    marginBottom: 24,
  },
  transcriptBubble: {
    padding: 14,
    borderRadius: 14,
    maxWidth: '88%',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1e3a5f',
  },
  recipientBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#2a2a3e',
  },
  roleTag: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  userTag: {
    color: '#64b5f6',
  },
  recipientTag: {
    color: '#81c784',
  },
  translatedText: {
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
    marginBottom: 4,
  },
  originalText: {
    fontSize: 15,
    color: '#b0b0c0',
    lineHeight: 22,
  },
  originalSmall: {
    fontSize: 13,
    color: '#8080a0',
    fontStyle: 'italic',
  },
});
