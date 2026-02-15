import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { useRouter } from 'expo-router';
import { RealtimeCallView } from '../../components/call/RealtimeCallView';

export default function CallScreen() {
  const router = useRouter();
  const {
    id,
    relayWsUrl,
    callMode = 'chat-to-voice',
    sourceLanguage = 'ko',
    targetLanguage = 'ko',
  } = useLocalSearchParams<{
    id: string;
    relayWsUrl: string;
    callMode: string;
    sourceLanguage: string;
    targetLanguage: string;
  }>();

  return (
    <RealtimeCallView
      callId={id!}
      relayWsUrl={relayWsUrl!}
      callMode={callMode as 'voice-to-voice' | 'chat-to-voice' | 'voice-to-text'}
      sourceLanguage={sourceLanguage as 'en' | 'ko'}
      targetLanguage={targetLanguage as 'en' | 'ko'}
      onCallEnd={() => router.back()}
    />
  );
}
