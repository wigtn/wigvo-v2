import { generateSessionBPrompt } from '../prompt/generator-v3.js';
import type { Language } from '../types.js';

export interface SessionBConfig {
  sourceLanguage: Language;
  targetLanguage: Language;
}

interface RealtimeSessionConfig {
  modalities: string[];
  instructions: string;
  voice: string;
  input_audio_format: string;
  output_audio_format: string;
  input_audio_transcription: { model: string };
  turn_detection: {
    type: string;
    threshold: number;
    prefix_padding_ms: number;
    silence_duration_ms: number;
  };
  temperature: number;
}

export function createSessionB(params: SessionBConfig): RealtimeSessionConfig {
  const { sourceLanguage, targetLanguage } = params;

  const instructions = generateSessionBPrompt({
    sourceLanguage,
    targetLanguage,
  });

  // Voice for translating recipient speech back to user
  const voice = sourceLanguage === 'ko' ? 'shimmer' : 'alloy';

  return {
    modalities: ['text', 'audio'],
    instructions,
    voice,
    input_audio_format: 'g711_ulaw',
    output_audio_format: 'pcm16',
    input_audio_transcription: { model: 'whisper-1' },
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
    },
    temperature: 0.6,
  };
}
