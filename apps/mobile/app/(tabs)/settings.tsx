import React, { useState } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import Slider from '@react-native-community/slider';

export default function SettingsScreen() {
  const [captionFontSize, setCaptionFontSize] = useState(16);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [highContrast, setHighContrast] = useState(false);

  return (
    <ScrollView style={styles.container}>
      {/* M-7: 접근성 설정 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>접근성</Text>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>자막 글꼴 크기</Text>
          <Text style={styles.settingValue}>{captionFontSize}px</Text>
        </View>
        {/* Slider may need @react-native-community/slider installed separately */}
        <View style={styles.sliderContainer}>
          <Text style={styles.sliderMin}>14</Text>
          <View style={styles.sliderTrack}>
            <Text style={[styles.settingValue, { fontSize: captionFontSize }]}>
              가나다 ABC
            </Text>
          </View>
          <Text style={styles.sliderMax}>28</Text>
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>진동 피드백</Text>
          <Switch
            value={vibrationEnabled}
            onValueChange={setVibrationEnabled}
            trackColor={{ false: '#2a2a3e', true: '#4a90d9' }}
          />
        </View>

        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>고대비 모드</Text>
          <Switch
            value={highContrast}
            onValueChange={setHighContrast}
            trackColor={{ false: '#2a2a3e', true: '#4a90d9' }}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>정보</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>버전</Text>
          <Text style={styles.settingValue}>3.0.0</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a3e',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4a90d9',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#ffffff',
  },
  settingValue: {
    fontSize: 16,
    color: '#8080a0',
  },
  sliderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 8,
  },
  sliderMin: {
    fontSize: 12,
    color: '#606080',
  },
  sliderMax: {
    fontSize: 12,
    color: '#606080',
  },
  sliderTrack: {
    flex: 1,
    alignItems: 'center',
  },
});
