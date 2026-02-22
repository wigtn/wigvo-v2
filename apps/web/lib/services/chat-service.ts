// =============================================================================
// WIGVO Chat Service
// =============================================================================
// Chat API의 비즈니스 로직을 분리한 서비스 레이어
// =============================================================================

import OpenAI from 'openai';
import { buildSystemPromptWithContext, buildScenarioPrompt } from '@/lib/prompts';
import { parseAssistantResponse } from '@/lib/response-parser';
import {
  CollectedData,
  DetectedIntent,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import {
  LLM_CONTEXT_MESSAGE_LIMIT,
} from '@/lib/constants';
import { extractDataFromMessage } from './data-extractor';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface MessageHistoryItem {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatContext {
  existingData: CollectedData;
  history: MessageHistoryItem[];
  userMessage: string;
  communicationMode?: CommunicationMode;
  locale?: string;
}

interface ChatResult {
  message: string;
  collected: Partial<CollectedData>;
  is_complete: boolean;
  detected_intent?: DetectedIntent;
}

// -----------------------------------------------------------------------------
// OpenAI Client
// -----------------------------------------------------------------------------

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// -----------------------------------------------------------------------------
// Direct Call System Prompt (translation-only, minimal collection)
// -----------------------------------------------------------------------------

function buildDirectCallPrompt(
  existingData: CollectedData,
): string {
  let contextSection = '';
  if (existingData.target_name || existingData.target_phone) {
    const items: string[] = [];
    if (existingData.target_name) items.push(`- target_name: "${existingData.target_name}"`);
    if (existingData.target_phone) items.push(`- target_phone: "${existingData.target_phone}"`);
    contextSection = `\n## 현재까지 수집된 정보\n${items.join('\n')}\n`;
  }

  return `당신은 WIGVO의 직접 통화 도우미입니다. 사용자가 직접 통화에 참여하며, AI는 실시간 번역만 담당합니다.

## 역할
전화할 곳의 이름(target_name)과 전화번호(target_phone)만 빠르게 수집하세요.

## ⚠️ 절대 규칙
- 정보를 지어내지 마세요. 확인된 정보만 collected에 넣으세요.
- 예약 시간, 인원수, 예약자 이름 등 상세 정보는 물어보지 마세요 — 사용자가 직접 통화에서 처리합니다.
- target_name + target_phone이 모두 확보되면 즉시 is_complete: true로 설정하세요.

## 대화 규칙
1. 간결하게 대화하세요. 1-2문장이면 충분합니다.
2. 전화할 곳과 번호만 확인되면 바로 완료하세요.
3. 이모지를 적절히 사용하세요.
${contextSection}
## 출력 형식
응답은 반드시 아래 구조의 JSON 객체**만** 반환하세요. JSON 외 다른 텍스트는 포함하지 마세요.

{
  "message": "사용자에게 보여줄 자연어 메시지",
  "collected": {
    "target_name": "전화할 곳 이름",
    "target_phone": "전화번호",
    "scenario_type": "INQUIRY",
    "scenario_sub_type": "OTHER"
  },
  "is_complete": false
}

## 📞 전화 걸기 안내
- WIGVO는 사용자 대신 전화를 걸어주는 서비스입니다.
- 정보가 모이면 "전화 걸기 버튼을 눌러주세요!"라고 안내하세요.
- "직접 전화해주세요"라고 절대 말하지 마세요.`.trim();
}

// -----------------------------------------------------------------------------
// Main: Process Chat
// -----------------------------------------------------------------------------

export async function processChat(context: ChatContext): Promise<ChatResult> {
  const { existingData, history, userMessage, communicationMode, locale } =
    context;

  // Direct phone input → skip LLM, return immediately (voice/text-to-voice only)
  if (communicationMode && communicationMode !== 'full_agent') {
    const extracted = extractDataFromMessage(userMessage, null);
    const phone = extracted.target_phone;
    if (phone) {
      const name = existingData.target_name || phone;
      const readyMsg = locale === 'ko'
        ? `${phone}(으)로 전화를 걸 준비가 되었어요! 전화 걸기 버튼을 눌러주세요.`
        : `Ready to call ${phone}! Press the call button to start.`;
      return {
        message: readyMsg,
        collected: {
          target_name: name,
          target_phone: phone,
          scenario_type: existingData.scenario_type || 'INQUIRY',
          scenario_sub_type: existingData.scenario_sub_type || 'OTHER',
        },
        is_complete: true,
      };
    }
  }

  // 1. 시스템 프롬프트 생성 (모드별 분기)
  let systemPrompt: string;

  // Direct call (non-full_agent): 번역 전용 간결한 프롬프트
  if (communicationMode && communicationMode !== 'full_agent') {
    systemPrompt = buildDirectCallPrompt(existingData);
  } else if (existingData.scenario_type && existingData.scenario_sub_type) {
    systemPrompt = buildScenarioPrompt(
      existingData.scenario_type,
      existingData.scenario_sub_type,
      existingData,
      communicationMode
    );
  } else {
    systemPrompt = buildSystemPromptWithContext(
      existingData,
      existingData.scenario_type || undefined,
    );
  }

  // Locale-aware instruction: tell the LLM what language to respond in
  // and what language pair the user has configured for the call.
  const langNames: Record<string, string> = {
    ko: 'Korean', en: 'English', ja: 'Japanese', zh: 'Chinese', vi: 'Vietnamese',
  };
  const srcName = langNames[existingData.source_language ?? ''] ?? existingData.source_language;
  const tgtName = langNames[existingData.target_language ?? ''] ?? existingData.target_language;
  const hasLangPair = existingData.source_language && existingData.target_language;

  if (locale && locale !== 'ko') {
    // Non-Korean UI: strong English override + language pair context
    const langLine = hasLangPair
      ? `\nThe user speaks ${srcName} and wants to call someone who speaks ${tgtName}.`
      : '';
    systemPrompt = `[SYSTEM OVERRIDE — LANGUAGE RULE]\nYou MUST respond ENTIRELY in English. The instructions below are in Korean for internal reference only — ignore their language and always reply in English.\nUse friendly, natural English. Keep JSON keys as-is.${langLine}\n[END OVERRIDE]\n\n${systemPrompt}`;
  } else if (hasLangPair) {
    // Korean UI: add language pair context (respond in Korean)
    systemPrompt = `[언어 설정] 사용자의 언어: ${srcName}. 통화 상대방 언어: ${tgtName}. 반드시 한국어로 응답하세요.\n\n${systemPrompt}`;
  }

  // 2. LLM 메시지 구성
  const llmMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-LLM_CONTEXT_MESSAGE_LIMIT).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
  ];

  // 3. OpenAI 호출 (JSON mode for reliable structured output)
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: llmMessages,
    temperature: 0.7,
    response_format: { type: 'json_object' },
  });

  const assistantContent =
    completion.choices[0]?.message?.content || '죄송합니다, 응답을 생성하지 못했어요.';

  // 4. 응답 파싱
  const parsed = parseAssistantResponse(assistantContent);

  // 5. 의도 감지 기반 시나리오 전환
  if (parsed.detected_intent && parsed.detected_intent.confidence >= 0.8) {
    const { scenario_type, scenario_sub_type } = parsed.detected_intent;
    if (
      scenario_type !== existingData.scenario_type ||
      scenario_sub_type !== existingData.scenario_sub_type
    ) {
      parsed.collected.scenario_type = scenario_type;
      parsed.collected.scenario_sub_type = scenario_sub_type;
    }
  }

  // 6. 사용자 메시지에서 추가 데이터 추출 (fallback)
  if (parsed.collected) {
    const extracted = extractDataFromMessage(
      userMessage,
      existingData.scenario_type
    );

    // 누락된 필드만 보정
    if (!parsed.collected.primary_datetime && extracted.primary_datetime) {
      parsed.collected.primary_datetime = extracted.primary_datetime;
    }
    if (parsed.collected.party_size == null && extracted.party_size != null) {
      parsed.collected.party_size = extracted.party_size;
    }
    if (!parsed.collected.customer_name && extracted.customer_name) {
      parsed.collected.customer_name = extracted.customer_name;
    }
    if (!parsed.collected.target_phone && extracted.target_phone) {
      parsed.collected.target_phone = extracted.target_phone;
    }
    if (!parsed.collected.target_name && extracted.target_name) {
      parsed.collected.target_name = extracted.target_name;
    }
    if (!parsed.collected.special_request && extracted.special_request) {
      parsed.collected.special_request = extracted.special_request;
    }
  }

  return {
    message: parsed.message,
    collected: parsed.collected || {},
    is_complete: parsed.is_complete,
    detected_intent: parsed.detected_intent,
  };
}

// -----------------------------------------------------------------------------
// Helper: Determine Ready Status
// -----------------------------------------------------------------------------

export function isReadyForCall(
  mergedData: CollectedData,
  isComplete: boolean,
  communicationMode?: CommunicationMode
): { ready: boolean; forceReady: boolean } {
  let canPlaceCall: boolean;

  if (communicationMode && communicationMode !== 'full_agent') {
    // relay 모드: target_name + target_phone만 있으면 전화 가능
    canPlaceCall = !!mergedData.target_name && !!mergedData.target_phone;
  } else {
    // full_agent: 기존 로직 (예약이면 primary_datetime도 필요)
    canPlaceCall =
      !!mergedData.target_name &&
      !!mergedData.target_phone &&
      (mergedData.scenario_type !== 'RESERVATION' || !!mergedData.primary_datetime);
  }

  const forceReady = !isComplete && canPlaceCall;

  return {
    ready: isComplete || forceReady,
    forceReady,
  };
}

export { extractDataFromMessage } from './data-extractor';
