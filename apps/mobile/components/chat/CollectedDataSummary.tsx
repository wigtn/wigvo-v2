import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export interface CollectedData {
  scenarioType: string;
  service: string;
  targetName: string;
  targetPhone: string;
  customerName: string;
  details: Record<string, string>;
}

interface CollectedDataSummaryProps {
  data: CollectedData;
  onStartCall: () => void;
  onEdit: () => void;
  isLoading?: boolean;
}

export function CollectedDataSummary({ data, onStartCall, onEdit, isLoading = false }: CollectedDataSummaryProps) {
  const scenarioLabels: Record<string, string> = {
    restaurant: '음식점 예약',
    hospital: '병원 예약',
    delivery: '배달 주문',
    taxi: '택시 호출',
    hotel: '호텔 예약',
    custom: '기타 통화',
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>수집된 정보</Text>

      <View style={styles.card}>
        <InfoRow label="유형" value={scenarioLabels[data.scenarioType] ?? data.scenarioType} />
        {data.service && <InfoRow label="업소명" value={data.service} />}
        {data.targetName && <InfoRow label="담당자" value={data.targetName} />}
        <InfoRow label="전화번호" value={data.targetPhone} />
        {data.customerName && <InfoRow label="고객명" value={data.customerName} />}

        {Object.entries(data.details).map(([key, value]) => (
          <InfoRow key={key} label={key} value={value} />
        ))}
      </View>

      <View style={styles.actions}>
        <Pressable
          style={styles.editButton}
          onPress={onEdit}
          accessible
          accessibilityRole="button"
          accessibilityLabel="정보 수정"
        >
          <Text style={styles.editText}>수정</Text>
        </Pressable>

        <Pressable
          style={[styles.callButton, isLoading && styles.callButtonDisabled]}
          onPress={onStartCall}
          disabled={isLoading}
          accessible
          accessibilityRole="button"
          accessibilityLabel="전화 걸기"
        >
          <Text style={styles.callText}>
            {isLoading ? '연결 중...' : '전화 걸기'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 16,
  },
  card: {
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2a2a3e',
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowLabel: {
    fontSize: 14,
    color: '#8080a0',
    fontWeight: '500',
  },
  rowValue: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '500',
    maxWidth: '60%',
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  editButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  editText: {
    color: '#8080a0',
    fontSize: 16,
    fontWeight: '600',
  },
  callButton: {
    flex: 2,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonDisabled: {
    backgroundColor: '#2a5a2e',
  },
  callText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
