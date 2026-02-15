import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, ScrollView, Text, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScenarioSelector, type ScenarioType } from '../../components/chat/ScenarioSelector';
import { ChatBubble, type ChatMessage } from '../../components/chat/ChatBubble';
import { ChatInput } from '../../components/chat/ChatInput';
import { CollectedDataSummary, type CollectedData } from '../../components/chat/CollectedDataSummary';

type Language = 'en' | 'ko';
type ChatPhase = 'scenario' | 'collecting' | 'summary';

const SCENARIO_QUESTIONS: Record<ScenarioType, string[]> = {
  restaurant: [
    '어떤 음식점에 전화할까요? (이름 또는 종류)',
    '예약 날짜와 시간을 알려주세요.',
    '몇 명이 방문하나요?',
    '예약자 이름을 알려주세요.',
    '전화번호를 입력해주세요.',
  ],
  hospital: [
    '어떤 병원에 전화할까요?',
    '진료 과목은 무엇인가요? (예: 내과, 정형외과)',
    '희망 날짜와 시간을 알려주세요.',
    '환자 이름을 알려주세요.',
    '전화번호를 입력해주세요.',
  ],
  delivery: [
    '어떤 음식을 주문할까요? (매장 이름)',
    '주문할 메뉴를 알려주세요.',
    '배달 받을 주소를 알려주세요.',
    '전화번호를 입력해주세요.',
  ],
  taxi: [
    '출발지를 알려주세요.',
    '도착지를 알려주세요.',
    '탑승 시간을 알려주세요. (지금 바로/예약)',
    '전화번호를 입력해주세요.',
  ],
  hotel: [
    '어떤 호텔에 전화할까요?',
    '체크인 날짜를 알려주세요.',
    '체크아웃 날짜를 알려주세요.',
    '객실 유형을 알려주세요. (싱글/더블/트윈)',
    '예약자 이름을 알려주세요.',
    '전화번호를 입력해주세요.',
  ],
  custom: [
    '어디에 전화할까요? (업소/기관명)',
    '어떤 용건으로 전화하나요?',
    '전달할 내용을 자세히 알려주세요.',
    '전화번호를 입력해주세요.',
  ],
};

const SCENARIO_FIELD_KEYS: Record<ScenarioType, string[]> = {
  restaurant: ['service', 'dateTime', 'partySize', 'customerName', 'phone'],
  hospital: ['service', 'department', 'dateTime', 'customerName', 'phone'],
  delivery: ['service', 'menu', 'address', 'phone'],
  taxi: ['pickup', 'destination', 'time', 'phone'],
  hotel: ['service', 'checkIn', 'checkOut', 'roomType', 'customerName', 'phone'],
  custom: ['service', 'purpose', 'details', 'phone'],
};

export default function ChatScreen() {
  const router = useRouter();
  const { id, mode } = useLocalSearchParams<{ id: string; mode?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [phase, setPhase] = useState<ChatPhase>('scenario');
  const [scenario, setScenario] = useState<ScenarioType | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [isStartingCall, setIsStartingCall] = useState(false);

  const sourceLanguage: Language = (mode === 'agent' ? 'ko' : 'en');
  const targetLanguage: Language = (mode === 'agent' ? 'ko' : 'ko');

  const addMessage = useCallback((role: ChatMessage['role'], text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-${Math.random()}`, role, text, timestamp: Date.now() },
    ]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  const handleScenarioSelect = useCallback((type: ScenarioType) => {
    setScenario(type);
    setPhase('collecting');
    setCurrentQuestionIdx(0);
    setAnswers([]);

    const questions = SCENARIO_QUESTIONS[type];
    addMessage('system', '정보 수집을 시작합니다');
    setTimeout(() => addMessage('assistant', questions[0]), 300);
  }, [addMessage]);

  const handleUserInput = useCallback((text: string) => {
    if (!scenario) return;

    addMessage('user', text);

    const questions = SCENARIO_QUESTIONS[scenario];
    const newAnswers = [...answers, text];
    setAnswers(newAnswers);

    const nextIdx = currentQuestionIdx + 1;
    if (nextIdx < questions.length) {
      setCurrentQuestionIdx(nextIdx);
      setTimeout(() => addMessage('assistant', questions[nextIdx]), 500);
    } else {
      // All questions answered → show summary
      setTimeout(() => {
        addMessage('system', '정보 수집이 완료되었습니다');
        setPhase('summary');
      }, 500);
    }
  }, [scenario, currentQuestionIdx, answers, addMessage]);

  const buildCollectedData = useCallback((): CollectedData | null => {
    if (!scenario) return null;

    const fieldKeys = SCENARIO_FIELD_KEYS[scenario];
    const details: Record<string, string> = {};
    let service = '';
    let customerName = '';
    let phone = '';

    fieldKeys.forEach((key, idx) => {
      const value = answers[idx] ?? '';
      if (key === 'service') service = value;
      else if (key === 'customerName') customerName = value;
      else if (key === 'phone') phone = value;
      else details[key] = value;
    });

    return {
      scenarioType: scenario,
      service,
      targetName: '',
      targetPhone: phone,
      customerName,
      details,
    };
  }, [scenario, answers]);

  const handleStartCall = useCallback(async () => {
    const data = buildCollectedData();
    if (!data || !data.targetPhone) {
      Alert.alert('오류', '전화번호가 필요합니다.');
      return;
    }

    setIsStartingCall(true);

    try {
      const relayUrl = process.env.EXPO_PUBLIC_RELAY_URL ?? 'http://localhost:3001';
      const callId = `call-${Date.now()}`;

      const res = await fetch(`${relayUrl}/relay/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callId,
          mode: 'agent',
          callMode: 'chat-to-voice',
          sourceLanguage,
          targetLanguage,
          collectedData: data,
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
          callMode: 'chat-to-voice',
          sourceLanguage,
          targetLanguage,
        },
      });
    } catch (err) {
      Alert.alert('오류', (err as Error).message);
    } finally {
      setIsStartingCall(false);
    }
  }, [buildCollectedData, sourceLanguage, targetLanguage, router]);

  const handleEdit = useCallback(() => {
    setPhase('collecting');
    setCurrentQuestionIdx(0);
    setAnswers([]);
    setMessages([]);
    if (scenario) {
      addMessage('system', '처음부터 다시 입력해주세요');
      setTimeout(() => addMessage('assistant', SCENARIO_QUESTIONS[scenario][0]), 300);
    }
  }, [scenario, addMessage]);

  // Scenario selection phase
  if (phase === 'scenario') {
    return (
      <View style={styles.container}>
        <ScenarioSelector onSelect={handleScenarioSelect} />
      </View>
    );
  }

  // Summary phase
  if (phase === 'summary') {
    const data = buildCollectedData();
    return (
      <View style={styles.container}>
        <ScrollView style={styles.chatScroll} ref={scrollRef} contentContainerStyle={styles.chatContent}>
          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}
        </ScrollView>
        {data && (
          <CollectedDataSummary
            data={data}
            onStartCall={handleStartCall}
            onEdit={handleEdit}
            isLoading={isStartingCall}
          />
        )}
      </View>
    );
  }

  // Collecting phase
  return (
    <View style={styles.container}>
      <ScrollView style={styles.chatScroll} ref={scrollRef} contentContainerStyle={styles.chatContent}>
        {messages.map((msg) => (
          <ChatBubble key={msg.id} message={msg} />
        ))}
      </ScrollView>
      <ChatInput onSend={handleUserInput} placeholder="답변을 입력하세요..." />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
  },
  chatScroll: {
    flex: 1,
  },
  chatContent: {
    padding: 16,
    paddingBottom: 8,
  },
});
