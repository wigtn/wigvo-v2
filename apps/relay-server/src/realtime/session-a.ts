import { generateSessionAPrompt } from '../prompt/generator-v3.js';
import type { Language, SessionMode, CallMode, CollectedData } from '../types.js';

export interface SessionAConfig {
  mode: SessionMode;
  callMode: CallMode;
  sourceLanguage: Language;
  targetLanguage: Language;
  collectedData?: CollectedData;
}

interface RealtimeSessionConfig {
  modalities: string[];
  instructions: string;
  voice: string;
  input_audio_format?: string;
  output_audio_format: string;
  input_audio_transcription?: { model: string };
  turn_detection: null;
  temperature: number;
}

export function createSessionA(params: SessionAConfig): RealtimeSessionConfig {
  const { mode, callMode, sourceLanguage, targetLanguage, collectedData } = params;

  const instructions = generateSessionAPrompt({
    mode,
    sourceLanguage,
    targetLanguage,
    collectedData,
  });

  // Voice selection based on target language
  const voice = targetLanguage === 'ko' ? 'shimmer' : 'alloy';

  // Common config: turn_detection is always null (manual control)
  const baseConfig: RealtimeSessionConfig = {
    modalities: ['text', 'audio'],
    instructions,
    voice,
    output_audio_format: 'g711_ulaw',
    turn_detection: null, // Manual: client VAD or push-to-talk
    temperature: 0.6,
  };

  if (callMode === 'voice-to-voice') {
    // Relay Mode: audio input from user
    return {
      ...baseConfig,
      input_audio_format: 'pcm16',
      input_audio_transcription: { model: 'whisper-1' },
    };
  }

  // Agent Mode / Push-to-Talk: text input only
  return baseConfig;
}
