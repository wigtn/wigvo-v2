import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

type OverlayStatus = 'recovering' | 'degraded' | 'reconnected' | null;

interface CallStatusOverlayProps {
  status: OverlayStatus;
  gapMs?: number;
}

export function CallStatusOverlay({ status, gapMs }: CallStatusOverlayProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status === 'reconnected') {
      // Flash green then fade out
      Animated.sequence([
        Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.delay(2000),
        Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    } else if (status) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    } else {
      Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }
  }, [status]);

  if (!status) return null;

  const config = getOverlayConfig(status, gapMs);

  return (
    <Animated.View
      style={[styles.overlay, { backgroundColor: config.bgColor, opacity: fadeAnim }]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={config.accessibilityLabel}
    >
      <Text style={styles.icon}>{config.icon}</Text>
      <View style={styles.textContainer}>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.subtitle}>{config.subtitle}</Text>
      </View>
    </Animated.View>
  );
}

function getOverlayConfig(status: NonNullable<OverlayStatus>, gapMs?: number) {
  switch (status) {
    case 'recovering':
      return {
        bgColor: '#ff980040',
        icon: '🔄',
        title: '연결 복구 중...',
        subtitle: '잠시만 기다려 주세요',
        accessibilityLabel: '연결 복구 중입니다',
      };
    case 'degraded':
      return {
        bgColor: '#f4433640',
        icon: '⚠️',
        title: '제한된 모드',
        subtitle: '음성 인식이 일시적으로 제한됩니다',
        accessibilityLabel: '제한된 모드로 전환되었습니다',
      };
    case 'reconnected':
      return {
        bgColor: '#4caf5040',
        icon: '✅',
        title: '연결 복구됨',
        subtitle: gapMs ? `${(gapMs / 1000).toFixed(1)}초 간격 복구` : '정상 연결됨',
        accessibilityLabel: '연결이 복구되었습니다',
      };
  }
}

const styles = StyleSheet.create({
  overlay: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    gap: 12,
  },
  icon: {
    fontSize: 24,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  subtitle: {
    color: '#ffffffcc',
    fontSize: 12,
    marginTop: 2,
  },
});
