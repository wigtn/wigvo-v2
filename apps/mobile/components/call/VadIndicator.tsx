import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { VadState } from '../../lib/vad/vad-config';

interface VadIndicatorProps {
  state: VadState;
  isRecording: boolean;
}

export function VadIndicator({ state, isRecording }: VadIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (state === 'SPEAKING') {
      // Pulse animation while speaking
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.3, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [state]);

  if (!isRecording) return null;

  const stateConfig = getStateConfig(state);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`마이크 상태: ${stateConfig.label}`}
    >
      <Animated.View
        style={[
          styles.dot,
          { backgroundColor: stateConfig.color, transform: [{ scale: pulseAnim }] },
        ]}
      />
      <Text style={[styles.label, { color: stateConfig.color }]}>
        {stateConfig.label}
      </Text>
    </View>
  );
}

function getStateConfig(state: VadState) {
  switch (state) {
    case 'SILENT':
      return { color: '#606080', label: '대기 중' };
    case 'SPEAKING':
      return { color: '#4caf50', label: '말하는 중...' };
    case 'COMMITTED':
      return { color: '#ff9800', label: '처리 중...' };
  }
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
  },
});
