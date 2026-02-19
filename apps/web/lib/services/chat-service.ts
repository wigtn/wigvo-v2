// =============================================================================
// WIGVO Chat Service
// =============================================================================
// Chat API의 비즈니스 로직을 분리한 서비스 레이어
// =============================================================================

import OpenAI from 'openai';
import { buildSystemPromptWithContext, buildScenarioPrompt } from '@/lib/prompts';
import { parseAssistantResponse } from '@/lib/response-parser';
import {
  searchNaverPlaces,
  type NaverPlaceResult,
} from '@/lib/naver-maps';
import {
  CollectedData,
  mergeCollectedData,
  NaverPlaceResultBasic,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import {
  LLM_CONTEXT_MESSAGE_LIMIT,
  MAX_TOOL_CALL_LOOPS,
} from '@/lib/constants';
import { matchPlaceFromUserMessage } from './place-matcher';
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
  location?: { lat: number; lng: number };
  previousSearchResults?: NaverPlaceResultBasic[];
  communicationMode?: CommunicationMode;
  locale?: string;
}

interface ChatResult {
  message: string;
  collected: Partial<CollectedData>;
  is_complete: boolean;
  searchResults: NaverPlaceResult[];
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
// Naver API Configuration
// -----------------------------------------------------------------------------

function isNaverConfigured(): boolean {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

// -----------------------------------------------------------------------------
// OpenAI Function Tool
// -----------------------------------------------------------------------------

const SEARCH_TOOL: OpenAI.Chat.ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'search_place',
    description:
      '네이버 지역검색으로 가게/장소를 검색합니다. 가게 이름, 전화번호, 주소를 찾을 수 있습니다. 사용자가 장소를 언급하면 반드시 이 도구로 검색하세요.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            '검색어. 지역명 + 가게명 형태가 가장 정확합니다. 예: "강남 수담한정식", "홍대 헤어살롱", "판교 삼성서비스센터"',
        },
      },
      required: ['query'],
    },
  },
};

// -----------------------------------------------------------------------------
// Helper: Format Search Results
// -----------------------------------------------------------------------------

function formatSearchResultsForTool(results: NaverPlaceResult[]): string {
  if (results.length === 0) {
    return '검색 결과가 없습니다. 사용자에게 가게 이름과 전화번호를 직접 알려달라고 요청하세요.';
  }

  const lines = results.map((r, i) => {
    const tel = r.telephone ? `📞 ${r.telephone}` : '📞 번호 미등록';
    return `${i + 1}. ${r.name} | ${tel} | 📍 ${r.roadAddress || r.address} | ${r.category}`;
  });

  const withPhone = results.filter((r) => r.telephone);
  const withoutPhone = results.filter((r) => !r.telephone);

  let phoneInstruction: string;
  if (withPhone.length > 0 && withoutPhone.length > 0) {
    phoneInstruction =
      `전화번호가 있는 곳 ${withPhone.length}곳, 미등록 ${withoutPhone.length}곳입니다.\n` +
      `전화번호가 있는 곳은 바로 사용 가능합니다. 없는 곳은 사용자에게 번호를 아는지 물어보세요.`;
  } else if (withPhone.length > 0) {
    phoneInstruction = `모든 결과에 전화번호가 있습니다.`;
  } else {
    phoneInstruction =
      `검색된 가게들의 전화번호가 네이버에 등록되어 있지 않습니다.\n` +
      `사용자가 선택하면 전화번호를 알고 있는지 확인하세요.`;
  }

  const coreInstruction =
    results.length === 1
      ? `1. 검색 결과가 1건이므로 "어디에 전화할까요?"라고 묻지 마세요. **target_name에 위 가게 이름("${results[0].name}")을 바로 저장**하세요.
2. 전화번호가 없으면 사용자에게 전화번호를 알려달라고 하세요. 있으면 target_phone도 저장하세요.
3. 응답에 반드시 JSON 블록을 포함하세요. target_name을 빠뜨리면 안 됩니다.`
      : `1. 반드시 위 목록을 사용자에게 보여주고, 어디에 전화할지 물어보세요.
2. 사용자가 장소를 선택하면 (예: "1번", "하브 삼성으로 할게"), **반드시 JSON의 target_name에 해당 가게 정확한 이름을 즉시 저장하세요.** 전화번호가 있으면 target_phone도 저장하세요.
3. 응답에 반드시 JSON 블록을 포함하세요. target_name을 빠뜨리면 안 됩니다.`;

  return `검색 결과 ${results.length}건:\n${lines.join('\n')}\n\n[중요 지시]\n${coreInstruction}\n\n${phoneInstruction}`;
}


// -----------------------------------------------------------------------------
// Direct Call System Prompt (translation-only, minimal collection)
// -----------------------------------------------------------------------------

function buildDirectCallPrompt(
  existingData: CollectedData,
  placeSearchResults?: Array<{ name: string; telephone: string; address: string }>,
): string {
  let contextSection = '';
  if (existingData.target_name || existingData.target_phone) {
    const items: string[] = [];
    if (existingData.target_name) items.push(`- target_name: "${existingData.target_name}"`);
    if (existingData.target_phone) items.push(`- target_phone: "${existingData.target_phone}"`);
    contextSection = `\n## 현재까지 수집된 정보\n${items.join('\n')}\n`;
  }

  let placeSection = '';
  if (placeSearchResults && placeSearchResults.length > 0) {
    placeSection = `\n## 장소 검색 결과\n${placeSearchResults.map((p, i) =>
      `${i + 1}. ${p.name} (${p.telephone}) - ${p.address}`
    ).join('\n')}\n\n**중요**: 사용자가 위 결과에서 선택하면 target_name과 target_phone을 저장하세요.\n`;
  }

  return `당신은 WIGVO의 직접 통화 도우미입니다. 사용자가 직접 통화에 참여하며, AI는 실시간 번역만 담당합니다.

## 역할
전화할 곳의 이름(target_name)과 전화번호(target_phone)만 빠르게 수집하세요.

## ⚠️ 절대 규칙
- 정보를 지어내지 마세요. 확인된 정보만 collected에 넣으세요.
- 예약 시간, 인원수, 예약자 이름 등 상세 정보는 물어보지 마세요 — 사용자가 직접 통화에서 처리합니다.
- target_name + target_phone이 모두 확보되면 즉시 is_complete: true로 설정하세요.

## 🔍 장소 검색 기능
search_place 도구로 장소를 검색할 수 있습니다.
- 사용자가 장소명을 언급하면 반드시 검색하세요.
- 검색 결과에서 전화번호를 확보하세요.
- 검색 결과가 없으면 사용자에게 직접 알려달라고 하세요.

## 대화 규칙
1. 간결하게 대화하세요. 1-2문장이면 충분합니다.
2. 전화할 곳과 번호만 확인되면 바로 완료하세요.
3. 이모지를 적절히 사용하세요.
${contextSection}${placeSection}
## 출력 형식
매 응답마다 아래 JSON 블록을 포함하세요:

\`\`\`json
{
  "collected": {
    "target_name": "전화할 곳 이름",
    "target_phone": "전화번호",
    "scenario_type": "INQUIRY",
    "scenario_sub_type": "OTHER"
  },
  "is_complete": false
}
\`\`\`

## 📞 전화 걸기 안내
- WIGVO는 사용자 대신 전화를 걸어주는 서비스입니다.
- 정보가 모이면 "전화 걸기 버튼을 눌러주세요!"라고 안내하세요.
- "직접 전화해주세요"라고 절대 말하지 마세요.`.trim();
}

// -----------------------------------------------------------------------------
// Main: Process Chat
// -----------------------------------------------------------------------------

export async function processChat(context: ChatContext): Promise<ChatResult> {
  const { existingData, history, userMessage, location, previousSearchResults, communicationMode, locale } =
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
        searchResults: [],
      };
    }
  }

  // 이전 검색 결과 초기화
  let placeSearchResults: NaverPlaceResult[] = previousSearchResults || [];

  // 1. 시스템 프롬프트 생성 (모드별 분기)
  let systemPrompt: string;
  const placeResults = placeSearchResults.length > 0
    ? placeSearchResults.map((p) => ({
        name: p.name,
        telephone: p.telephone,
        address: p.address || p.roadAddress,
      }))
    : undefined;

  // Direct call (non-full_agent): 번역 전용 간결한 프롬프트
  if (communicationMode && communicationMode !== 'full_agent') {
    systemPrompt = buildDirectCallPrompt(existingData, placeResults);
  } else if (existingData.scenario_type && existingData.scenario_sub_type) {
    systemPrompt = buildScenarioPrompt(
      existingData.scenario_type,
      existingData.scenario_sub_type,
      existingData,
      placeResults,
      communicationMode
    );
  } else {
    systemPrompt = buildSystemPromptWithContext(
      existingData,
      existingData.scenario_type || undefined,
      placeResults
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

  // 3. OpenAI 호출 (Function Calling 지원)
  let assistantContent: string;
  const tools = isNaverConfigured() ? [SEARCH_TOOL] : undefined;

  let completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: llmMessages,
    temperature: 0.7,
    tools,
  });

  let choice = completion.choices[0];

  // Function Calling 루프
  let loopCount = 0;
  while (
    choice?.finish_reason === 'tool_calls' &&
    choice.message.tool_calls &&
    choice.message.tool_calls.length > 0 &&
    loopCount < MAX_TOOL_CALL_LOOPS
  ) {
    loopCount++;
    llmMessages.push(choice.message);

    for (const toolCall of choice.message.tool_calls) {
      const tc = toolCall as {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      };

      if (tc.type === 'function' && tc.function.name === 'search_place') {
        let formatted: string;
        try {
          const args = JSON.parse(tc.function.arguments);
          console.log(`[Chat] 🔍 AI가 검색 요청: "${args.query}"`);
          const results = await searchNaverPlaces(args.query, location);
          placeSearchResults = results;
          formatted = formatSearchResultsForTool(results);
        } catch (searchErr) {
          console.error('[Chat] 검색 실행 오류:', searchErr);
          formatted =
            '검색 중 오류가 발생했습니다. 사용자에게 가게 이름과 전화번호를 알려달라고 요청하세요.';
        }
        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: formatted,
        });
      } else {
        llmMessages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: 'Unknown tool.',
        });
      }
    }

    completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: llmMessages,
      temperature: 0.7,
      tools,
    });

    choice = completion.choices[0];
  }

  assistantContent =
    choice?.message?.content || '죄송합니다, 응답을 생성하지 못했어요.';

  // 4. 응답 파싱
  const parsed = parseAssistantResponse(assistantContent);

  // 5. AI가 target_name을 빠뜨렸을 때 검색 결과에서 자동 매칭
  if (
    placeSearchResults.length > 0 &&
    !parsed.collected?.target_name &&
    userMessage
  ) {
    const { matched, matchType } = matchPlaceFromUserMessage(
      userMessage,
      placeSearchResults
    );
    if (matched) {
      if (!parsed.collected) {
        parsed.collected = {} as Partial<CollectedData>;
      }
      parsed.collected.target_name = matched.name;
      if (matched.telephone) {
        parsed.collected.target_phone = matched.telephone;
      }
      console.log(
        `[Chat] 🔧 ${matchType === 'number' ? '번호 선택' : '이름 매칭'}: target_name="${matched.name}"`
      );
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
    if (!parsed.collected.special_request && extracted.special_request) {
      parsed.collected.special_request = extracted.special_request;
    }
  }

  // 7. 검색 결과 1건 + target_name 누락 시 자동 보정
  if (
    placeSearchResults.length === 1 &&
    parsed.collected &&
    !parsed.collected.target_name &&
    (parsed.collected.target_phone || existingData?.target_phone)
  ) {
    parsed.collected.target_name = placeSearchResults[0].name;
    if (placeSearchResults[0].telephone) {
      parsed.collected.target_phone = placeSearchResults[0].telephone;
    }
  }

  return {
    message: parsed.message,
    collected: parsed.collected || {},
    is_complete: parsed.is_complete,
    searchResults: placeSearchResults,
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

// Re-exports for backward compatibility
export { matchPlaceFromUserMessage } from './place-matcher';
export type { PlaceMatchResult } from './place-matcher';
export { extractDataFromMessage } from './data-extractor';
