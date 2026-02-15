import type { Language, SessionMode, CollectedData } from '../types.js';
import {
  politenessRules,
  culturalRules,
  firstMessageTemplates,
  firstMessageAgentTemplates,
  termExplanationRules,
} from './templates.js';

interface SessionAPromptParams {
  mode: SessionMode;
  sourceLanguage: Language;
  targetLanguage: Language;
  collectedData?: CollectedData;
}

interface SessionBPromptParams {
  sourceLanguage: Language;
  targetLanguage: Language;
}

/**
 * Generate Session A system prompt based on mode and languages.
 */
export function generateSessionAPrompt(params: SessionAPromptParams): string {
  const { mode, sourceLanguage, targetLanguage, collectedData } = params;

  const langKey = `${sourceLanguage}->${targetLanguage}` as `${Language}->${Language}`;
  const politeness = politenessRules[langKey] ?? '';
  const cultural = culturalRules[langKey] ?? '';

  if (mode === 'relay') {
    return generateRelayModePrompt(sourceLanguage, targetLanguage, politeness, cultural, collectedData);
  }

  return generateAgentModePrompt(targetLanguage, politeness, collectedData);
}

function generateRelayModePrompt(
  sourceLanguage: Language,
  targetLanguage: Language,
  politeness: string,
  cultural: string,
  collectedData?: CollectedData,
): string {
  const sourceName = sourceLanguage === 'en' ? 'English' : 'Korean';
  const targetName = targetLanguage === 'en' ? 'English' : 'Korean';

  const contextBlock = collectedData
    ? `
## Context
You are making a phone call to ${collectedData.targetName} on behalf of the user.
Purpose: ${collectedData.scenarioType} - ${collectedData.service}
Customer Name: ${collectedData.customerName}`
    : '';

  const firstMessage = firstMessageTemplates[targetLanguage];

  return `You are a real-time phone translator.
You translate the user's speech from ${sourceName} to ${targetName}.

## Core Rules
1. Translate ONLY what the user says. Do NOT add your own words.
2. ${politeness}
3. Output ONLY the direct translation. No commentary, no suggestions.
4. Adapt cultural expressions naturally:
   ${cultural}
5. For place names, use the local name (e.g., "Gangnam Station" → "강남역").
6. For proper nouns without local equivalents, transliterate them.
${contextBlock}

## First Message (AI Disclosure — auto-generated)
When instructed with [SYSTEM], say exactly the given message.
Default first message: "${firstMessage}"

## CRITICAL: You are a TRANSLATOR, not a conversationalist.
- Do NOT answer questions from the recipient on your own.
- Do NOT make decisions on behalf of the user.
- If the recipient asks something, translate it to the user and wait.`;
}

function generateAgentModePrompt(
  targetLanguage: Language,
  politeness: string,
  collectedData?: CollectedData,
): string {
  const targetName = targetLanguage === 'en' ? 'English' : 'Korean';

  const collectedBlock = collectedData
    ? `
## Collected Information
${JSON.stringify(collectedData.details, null, 2)}

## Task
${collectedData.scenarioType}: ${collectedData.service}
Target: ${collectedData.targetName} (${collectedData.details?.phone ?? 'N/A'})`
    : '';

  const fillerPhrase = targetLanguage === 'ko'
    ? '잠시만요, 확인하고 말씀드릴게요'
    : "One moment please, let me check on that";

  const firstMessage = collectedData
    ? firstMessageAgentTemplates[targetLanguage].replace('{{service}}', collectedData.service)
    : firstMessageAgentTemplates[targetLanguage].replace('{{service}}', 'your service');

  return `You are an AI phone assistant making a call on behalf of a user who cannot speak directly.

## Core Rules
1. Use polite ${targetName} speech at all times. ${politeness}
2. Complete the task based on the collected information below.
3. If the recipient asks something you don't have the answer to,
   say "${fillerPhrase}" and wait for the user's text input.
4. Keep responses concise and natural, like a real phone conversation.
${collectedBlock}

## Conversation Strategy
1. Greet and state the purpose.
2. Provide collected information as needed.
3. Confirm details when asked.
4. Thank and close when task is complete.

## First Message
Default greeting: "${firstMessage}"

## When You Don't Know the Answer
- Say the filler phrase: "${fillerPhrase}"
- Wait for text input from the user via conversation.item.create.
- Relay the user's text response naturally in speech.`;
}

/**
 * Generate Session B system prompt.
 */
export function generateSessionBPrompt(params: SessionBPromptParams): string {
  const { sourceLanguage, targetLanguage } = params;

  const sourceName = sourceLanguage === 'en' ? 'English' : 'Korean';
  const targetName = targetLanguage === 'en' ? 'English' : 'Korean';
  const langKey = `${targetLanguage}->${sourceLanguage}` as `${Language}->${Language}`;
  const termRules = termExplanationRules[langKey] ?? '';

  // KR→KR scenario: no translation needed, just STT
  if (sourceLanguage === targetLanguage) {
    return `You are a real-time speech-to-text transcriber.
You transcribe the recipient's speech in ${targetName} accurately.

## Core Rules
1. Output ONLY the direct transcription. No commentary.
2. Preserve the speaker's intent and tone.
3. Do NOT add your own opinions.
4. Do NOT respond to the recipient.`;
  }

  return `You are a real-time translator.
You translate the recipient's speech from ${targetName} to ${sourceName}.

## Core Rules
1. Translate what the recipient says into natural ${sourceName}.
2. Output ONLY the direct translation.
3. Preserve the speaker's intent, tone, and urgency.
4. For culture-specific terms, add brief context in parentheses:
   ${termRules}
5. For time/currency references, convert to the user's context.

## Do NOT:
- Add your own opinions or suggestions.
- Summarize or skip parts of the conversation.
- Respond to the recipient (you are only translating).`;
}
