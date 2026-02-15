import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

export type ScenarioType =
  | 'restaurant'
  | 'hospital'
  | 'delivery'
  | 'taxi'
  | 'hotel'
  | 'custom';

interface Scenario {
  key: ScenarioType;
  icon: string;
  label: string;
  description: string;
}

const SCENARIOS: Scenario[] = [
  { key: 'restaurant', icon: '🍽️', label: '음식점 예약', description: '레스토랑 예약, 문의' },
  { key: 'hospital', icon: '🏥', label: '병원 예약', description: '진료 예약, 변경' },
  { key: 'delivery', icon: '🛵', label: '배달 주문', description: '음식 배달 주문' },
  { key: 'taxi', icon: '🚕', label: '택시 호출', description: '택시 호출, 예약' },
  { key: 'hotel', icon: '🏨', label: '호텔 예약', description: '호텔/숙소 예약' },
  { key: 'custom', icon: '📞', label: '기타 통화', description: '직접 내용 입력' },
];

interface ScenarioSelectorProps {
  onSelect: (scenario: ScenarioType) => void;
}

export function ScenarioSelector({ onSelect }: ScenarioSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>어떤 전화를 걸까요?</Text>
      <Text style={styles.subtitle}>상황을 선택하면 필요한 정보를 안내해드릴게요</Text>
      <View style={styles.grid}>
        {SCENARIOS.map((s) => (
          <Pressable
            key={s.key}
            style={styles.card}
            onPress={() => onSelect(s.key)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`${s.label}: ${s.description}`}
          >
            <Text style={styles.icon}>{s.icon}</Text>
            <Text style={styles.label}>{s.label}</Text>
            <Text style={styles.desc}>{s.description}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#8080a0',
    marginBottom: 24,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: '47%',
    backgroundColor: '#1a1a2e',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  icon: {
    fontSize: 32,
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: 4,
  },
  desc: {
    fontSize: 12,
    color: '#8080a0',
  },
});
