import React, { useState } from 'react';
import { View, Text, Pressable, TextInput, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

type Language = 'en' | 'ko';

export default function HomeScreen() {
  const router = useRouter();
  const [showQuickCall, setShowQuickCall] = useState(false);
  const [phone, setPhone] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<Language>('en');
  const [isStarting, setIsStarting] = useState(false);

  const handleTranslationCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowQuickCall(true);
  };

  const handleAgentCall = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/chat/new?mode=agent');
  };

  const handleStartQuickCall = async () => {
    if (!phone.trim()) {
      Alert.alert('오류', '전화번호를 입력해주세요.');
      return;
    }

    setIsStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const relayUrl = process.env.EXPO_PUBLIC_RELAY_URL ?? 'http://localhost:3001';
      const callId = `call-${Date.now()}`;
      const targetLanguage: Language = sourceLanguage === 'en' ? 'ko' : 'en';

      const res = await fetch(`${relayUrl}/relay/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          mode: 'relay',
          callMode: 'voice-to-voice',
          sourceLanguage,
          targetLanguage,
          collectedData: {
            scenarioType: 'custom',
            service: '',
            targetName: '',
            targetPhone: phone.trim(),
            customerName: '',
            details: {},
          },
        }),
      });

      const result = await res.json();

      if (!result.success) {
        throw new Error(result.error?.message ?? '통화 시작에 실패했습니다');
      }

      router.push({
        pathname: '/call/[id]',
        params: {
          id: callId,
          relayWsUrl: result.data.relayWsUrl,
          callMode: 'voice-to-voice',
          sourceLanguage,
          targetLanguage,
        },
      });
    } catch (err) {
      Alert.alert('오류', (err as Error).message);
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.title}>WIGVO</Text>
        <Text style={styles.subtitle}>AI 실시간 통역 전화</Text>
      </View>

      {showQuickCall ? (
        <View style={styles.quickCallCard}>
          <Text style={styles.quickCallTitle}>번역 통화</Text>

          {/* Language Selector */}
          <View style={styles.langSelector}>
            <Pressable
              style={[styles.langButton, sourceLanguage === 'en' && styles.langButtonActive]}
              onPress={() => setSourceLanguage('en')}
              accessible
              accessibilityRole="radio"
              accessibilityState={{ selected: sourceLanguage === 'en' }}
            >
              <Text style={[styles.langText, sourceLanguage === 'en' && styles.langTextActive]}>
                EN → KO
              </Text>
              <Text style={styles.langDesc}>영어로 말하기</Text>
            </Pressable>
            <Pressable
              style={[styles.langButton, sourceLanguage === 'ko' && styles.langButtonActive]}
              onPress={() => setSourceLanguage('ko')}
              accessible
              accessibilityRole="radio"
              accessibilityState={{ selected: sourceLanguage === 'ko' }}
            >
              <Text style={[styles.langText, sourceLanguage === 'ko' && styles.langTextActive]}>
                KO → EN
              </Text>
              <Text style={styles.langDesc}>한국어로 말하기</Text>
            </Pressable>
          </View>

          {/* Phone Input */}
          <TextInput
            style={styles.phoneInput}
            value={phone}
            onChangeText={setPhone}
            placeholder="전화번호 입력 (예: 010-1234-5678)"
            placeholderTextColor="#606080"
            keyboardType="phone-pad"
            autoFocus
            accessible
            accessibilityLabel="전화번호 입력"
          />

          <View style={styles.quickCallActions}>
            <Pressable style={styles.cancelButton} onPress={() => setShowQuickCall(false)}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.startButton, isStarting && styles.startButtonDisabled]}
              onPress={handleStartQuickCall}
              disabled={isStarting}
              accessible
              accessibilityRole="button"
              accessibilityLabel="전화 걸기"
            >
              <Text style={styles.startText}>{isStarting ? '연결 중...' : '전화 걸기'}</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleTranslationCall}
            accessible
            accessibilityRole="button"
            accessibilityLabel="새 번역 통화 시작"
          >
            <Text style={styles.actionEmoji}>🌍</Text>
            <Text style={styles.actionTitle}>번역 통화</Text>
            <Text style={styles.actionDesc}>외국어 실시간 번역 통화</Text>
          </Pressable>

          <Pressable
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={handleAgentCall}
            accessible
            accessibilityRole="button"
            accessibilityLabel="대리 통화 시작"
          >
            <Text style={styles.actionEmoji}>💬</Text>
            <Text style={styles.actionTitle}>대리 통화</Text>
            <Text style={styles.actionDesc}>정보를 입력하면 AI가 대신 전화</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 24,
  },
  hero: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 48,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 16,
    color: '#8080a0',
    marginTop: 8,
  },
  actions: {
    gap: 16,
  },
  actionButton: {
    padding: 24,
    borderRadius: 16,
    minHeight: 100,
  },
  primaryButton: {
    backgroundColor: '#1e3a5f',
  },
  secondaryButton: {
    backgroundColor: '#2a2a3e',
  },
  actionEmoji: {
    fontSize: 28,
    marginBottom: 8,
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 4,
  },
  actionDesc: {
    fontSize: 14,
    color: '#8080a0',
  },
  // Quick Call Card
  quickCallCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 20,
    padding: 24,
    borderWidth: 1,
    borderColor: '#2a2a3e',
  },
  quickCallTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: 20,
  },
  langSelector: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  langButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#2a2a3e',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  langButtonActive: {
    borderColor: '#4a90d9',
    backgroundColor: '#1e3a5f',
  },
  langText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#8080a0',
    marginBottom: 2,
  },
  langTextActive: {
    color: '#ffffff',
  },
  langDesc: {
    fontSize: 11,
    color: '#606080',
  },
  phoneInput: {
    backgroundColor: '#2a2a3e',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 20,
  },
  quickCallActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2a2a3e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    color: '#8080a0',
    fontSize: 16,
    fontWeight: '600',
  },
  startButton: {
    flex: 2,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#4caf50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startButtonDisabled: {
    backgroundColor: '#2a5a2e',
  },
  startText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
