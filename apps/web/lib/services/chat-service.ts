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
import {
  LLM_CONTEXT_MESSAGE_LIMIT,
  MAX_TOOL_CALL_LOOPS,
} from '@/lib/constants';

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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
// Helper: Match Place from User Selection
// -----------------------------------------------------------------------------

interface PlaceMatchResult {
  matched: NaverPlaceResult | null;
  matchType: 'number' | 'name' | 'none';
}

export function matchPlaceFromUserMessage(
  message: string,
  searchResults: NaverPlaceResult[]
): PlaceMatchResult {
  if (searchResults.length === 0) {
    return { matched: null, matchType: 'none' };
  }

  const trimmed = message.trim();

  // 1) "1번", "2번", "4번", "나는 4번", "4번으로", "첫번째" 등 번호 선택 해석
  // 메시지 어디서든 숫자+번 패턴을 찾음 (앵커 없이)
  const numMatch = trimmed.match(
    /(\d+)\s*번|첫\s*번째|두\s*번째|세\s*번째|네\s*번째|다섯\s*번째/
  );
  const ordinalMap: Record<string, number> = { 첫: 1, 두: 2, 세: 3, 네: 4, 다섯: 5 };
  let index = -1;

  if (numMatch) {
    if (numMatch[1]) {
      index = parseInt(numMatch[1], 10) - 1;
    } else {
      // 서수 매칭: "첫번째", "두번째" 등
      const matched = numMatch[0];
      for (const [key, val] of Object.entries(ordinalMap)) {
        if (matched.startsWith(key)) {
          index = val - 1;
          break;
        }
      }
    }
  } else {
    // 숫자만 입력한 경우 ("4", "1")
    const pureNum = trimmed.match(/^(\d+)$/);
    if (pureNum) {
      index = parseInt(pureNum[1], 10) - 1;
    }
  }

  if (index >= 0 && index < searchResults.length) {
    return { matched: searchResults[index], matchType: 'number' };
  }

  // 2) 메시지에 가게명이 포함된 경우
  const nameMatch =
    searchResults.find(
      (r) =>
        message.includes(r.name) ||
        r.name.includes(
          message.replace(/으로|에|로|할게|예약|선택|갈게|해줘/g, '').trim()
        )
    ) || null;

  if (nameMatch) {
    return { matched: nameMatch, matchType: 'name' };
  }

  return { matched: null, matchType: 'none' };
}

// -----------------------------------------------------------------------------
// Helper: Extract Data from User Message (Fallback)
// -----------------------------------------------------------------------------

export function extractDataFromMessage(
  message: string,
  scenarioType: string | null
): Partial<CollectedData> {
  const result: Partial<CollectedData> = {};
  const m = message.trim();

  // 날짜/시간 패턴
  if (/(오늘|내일|모레|다음\s*주|월|일|오전|오후|\d+시)/.test(m) && m.length <= 30) {
    result.primary_datetime = m;
  }

  // 인원수 패턴
  const partyMatch = m.match(/^(\d+)\s*명$/);
  if (partyMatch) {
    result.party_size = parseInt(partyMatch[1], 10);
  }

  // 예약자 이름 패턴 (2-4자 한글)
  if (
    /^[가-힣]{2,4}$/.test(m) &&
    !/^(오늘|내일|모레|다음|첫번째|두번째)$/.test(m)
  ) {
    result.customer_name = m;
  }

  // 전화번호 패턴 (국내 + E.164)
  const phoneMatch = m.match(
    /(\+82[\d-]{9,13})|(0\d{1,2}-?\d{3,4}-?\d{4})|(010\d{8})/
  );
  if (phoneMatch) {
    if (phoneMatch[1]) {
      // E.164: +8210-9265-9103 → +821092659103
      result.target_phone = phoneMatch[1].replace(/-/g, '');
    } else {
      const raw = (phoneMatch[2] || phoneMatch[3] || '').replace(/-/g, '');
      if (raw.length >= 10 && raw.length <= 11 && /^0\d+$/.test(raw)) {
        const withDashes = phoneMatch[2]?.includes('-') ? phoneMatch[2] : null;
        result.target_phone = withDashes ?? raw;
      }
    }
  }

  // INQUIRY(재고/가능 여부) 문의 내용
  if (scenarioType === 'INQUIRY') {
    const inquiryMatch = m.match(
      /(?:.*에\s+)?(.+?(?:남았는지|있는지|가능한지|있어|되나요))/
    );
    const phrase = inquiryMatch?.[1]
      ?.replace(/\s*(물어봐|문의해|확인해|전화해).*$/g, '')
      .trim();
    if (phrase && phrase.length >= 2 && phrase.length <= 80) {
      result.special_request = phrase;
    }
  }

  return result;
}

// -----------------------------------------------------------------------------
// Main: Process Chat
// -----------------------------------------------------------------------------

export async function processChat(context: ChatContext): Promise<ChatResult> {
  const { existingData, history, userMessage, location, previousSearchResults } =
    context;

  // 이전 검색 결과 초기화
  let placeSearchResults: NaverPlaceResult[] = previousSearchResults || [];

  // 1. 시스템 프롬프트 생성
  let systemPrompt: string;
  if (existingData.scenario_type && existingData.scenario_sub_type) {
    systemPrompt = buildScenarioPrompt(
      existingData.scenario_type,
      existingData.scenario_sub_type,
      existingData,
      placeSearchResults.length > 0
        ? placeSearchResults.map((p) => ({
            name: p.name,
            telephone: p.telephone,
            address: p.address || p.roadAddress,
          }))
        : undefined
    );
  } else {
    systemPrompt = buildSystemPromptWithContext(
      existingData,
      existingData.scenario_type || undefined,
      placeSearchResults.length > 0
        ? placeSearchResults.map((p) => ({
            name: p.name,
            telephone: p.telephone,
            address: p.address || p.roadAddress,
          }))
        : undefined
    );
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

  let completion = await openai.chat.completions.create({
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

    completion = await openai.chat.completions.create({
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
  isComplete: boolean
): { ready: boolean; forceReady: boolean } {
  const canPlaceCall =
    !!mergedData.target_name &&
    !!mergedData.target_phone &&
    (mergedData.scenario_type !== 'RESERVATION' || !!mergedData.primary_datetime);

  const forceReady = !isComplete && canPlaceCall;

  return {
    ready: isComplete || forceReady,
    forceReady,
  };
}
