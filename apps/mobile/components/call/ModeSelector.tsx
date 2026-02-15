import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';

type CallMode = 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text';

interface ModeSelectorProps {
  selectedMode: CallMode;
  onModeChange: (mode: CallMode) => void;
}

const MODES: { key: CallMode; label: string; icon: string; description: string }[] = [
  { key: 'voice-to-voice', label: '음성 번역', icon: '🎙️', description: '말하면 번역' },
  { key: 'chat-to-voice', label: '대리 통화', icon: '💬', description: '텍스트로 전달' },
  { key: 'voice-to-text', label: '음성→자막', icon: '📝', description: '자막만 표시' },
];

export function ModeSelector({ selectedMode, onModeChange }: ModeSelectorProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>통화 모드</Text>
      <View style={styles.modes}>
        {MODES.map((mode) => {
          const isSelected = selectedMode === mode.key;
          return (
            <Pressable
              key={mode.key}
              style={[styles.modeButton, isSelected && styles.modeButtonSelected]}
              onPress={() => onModeChange(mode.key)}
              accessible
              accessibilityRole="radio"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${mode.label}: ${mode.description}`}
            >
              <Text style={styles.modeIcon}>{mode.icon}</Text>
              <Text style={[styles.modeLabel, isSelected && styles.modeLabelSelected]}>
                {mode.label}
              </Text>
              <Text style={styles.modeDesc}>{mode.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a90d9',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  modes: {
    flexDirection: 'row',
    gap: 8,
  },
  modeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  modeButtonSelected: {
    borderColor: '#4a90d9',
    backgroundColor: '#1e3a5f',
  },
  modeIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  modeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8080a0',
    marginBottom: 2,
  },
  modeLabelSelected: {
    color: '#ffffff',
  },
  modeDesc: {
    fontSize: 10,
    color: '#606080',
  },
});
