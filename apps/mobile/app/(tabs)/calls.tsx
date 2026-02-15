import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase/client';

interface CallRecord {
  id: string;
  status: string;
  call_mode: string;
  source_language: string;
  target_language: string;
  duration_seconds: number | null;
  started_at: string;
  ended_at: string | null;
  transcript_bilingual: TranscriptEntry[] | null;
}

interface TranscriptEntry {
  role: string;
  originalText: string;
  translatedText?: string;
  language: string;
  timestamp: number;
}

const MODE_LABELS: Record<string, string> = {
  'voice-to-voice': '음성 번역',
  'chat-to-voice': '대리 통화',
  'voice-to-text': '음성 → 자막',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  completed: { label: '완료', color: '#4caf50' },
  failed: { label: '실패', color: '#f44336' },
  no_answer: { label: '부재', color: '#ff9800' },
  calling: { label: '진행 중', color: '#2196f3' },
  active: { label: '통화 중', color: '#2196f3' },
};

export default function CallsScreen() {
  const router = useRouter();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCalls = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('calls')
        .select('id, status, call_mode, source_language, target_language, duration_seconds, started_at, ended_at, transcript_bilingual')
        .order('started_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setCalls(data ?? []);
    } catch (err) {
      console.error('[CallsScreen] Failed to fetch calls:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchCalls();
  }, [fetchCalls]);

  const handleCallPress = useCallback((call: CallRecord) => {
    router.push({
      pathname: '/call-detail/[id]',
      params: { id: call.id },
    });
  }, [router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4a90d9" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CallHistoryItem call={item} onPress={() => handleCallPress(item)} />
        )}
        contentContainerStyle={calls.length === 0 ? styles.centered : styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>📞</Text>
            <Text style={styles.emptyTitle}>통화 기록이 없습니다</Text>
            <Text style={styles.emptyDesc}>첫 통화를 시작해보세요</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4a90d9" />
        }
      />
    </View>
  );
}

function CallHistoryItem({ call, onPress }: { call: CallRecord; onPress: () => void }) {
  const status = STATUS_LABELS[call.status] ?? { label: call.status, color: '#8080a0' };
  const modeLabel = MODE_LABELS[call.call_mode] ?? call.call_mode;
  const langPair = `${(call.source_language ?? 'en').toUpperCase()} → ${(call.target_language ?? 'ko').toUpperCase()}`;

  const date = new Date(call.started_at);
  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;

  const duration = call.duration_seconds
    ? `${Math.floor(call.duration_seconds / 60)}분 ${call.duration_seconds % 60}초`
    : '-';

  const transcriptCount = call.transcript_bilingual?.length ?? 0;

  return (
    <Pressable
      style={styles.callItem}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${modeLabel} 통화, ${dateStr}, ${status.label}`}
    >
      <View style={styles.callHeader}>
        <View style={styles.callMeta}>
          <Text style={styles.callMode}>{modeLabel}</Text>
          <Text style={styles.callLang}>{langPair}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: status.color + '30' }]}>
          <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.callDetails}>
        <Text style={styles.callDate}>{dateStr}</Text>
        <Text style={styles.callDuration}>{duration}</Text>
        {transcriptCount > 0 && (
          <Text style={styles.callTranscripts}>{transcriptCount}개 대화</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  callItem: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  callHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  callMeta: {
    flex: 1,
  },
  callMode: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 2,
  },
  callLang: {
    fontSize: 12,
    color: '#4a90d9',
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  callDetails: {
    flexDirection: 'row',
    gap: 16,
  },
  callDate: {
    fontSize: 13,
    color: '#8080a0',
  },
  callDuration: {
    fontSize: 13,
    color: '#8080a0',
  },
  callTranscripts: {
    fontSize: 13,
    color: '#606080',
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#8080a0',
  },
  emptyDesc: {
    fontSize: 14,
    color: '#606080',
  },
});
