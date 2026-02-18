// ============================================================================
// BE2-1: Dynamic Prompt Generator
// ============================================================================
// Owner: BE2
// Purpose: CollectedData → ElevenLabs System Prompt + Dynamic Variables 변환
// ============================================================================

import type { CollectedData } from '@/shared/types';

// --- Public Types ---

export interface DynamicPromptResult {
  /** 완성된 System Prompt 문자열 (ElevenLabs Agent에게 전달) */
  systemPrompt: string;
  /** ElevenLabs dynamic_variables 형식의 key-value 맵 */
  dynamicVariables: Record<string, string>;
}

// --- Main Entry Point ---

/**
 * 채팅에서 수집된 CollectedData를 기반으로
 * ElevenLabs Agent용 Dynamic System Prompt와 Dynamic Variables를 생성합니다.
 */
export function generateDynamicPrompt(data: CollectedData): DynamicPromptResult {
  const systemPrompt = buildSystemPrompt(data);
  const dynamicVariables = formatForElevenLabs(data);
  return { systemPrompt, dynamicVariables };
}

/**
 * CollectedData를 ElevenLabs Dynamic Variables 형식으로 변환합니다.
 * null/undefined 값은 제외됩니다.
 */
export function formatForElevenLabs(data: CollectedData): Record<string, string> {
  const vars: Record<string, string> = {};

  if (data.target_name) vars.target_name = data.target_name;
  if (data.primary_datetime) vars.datetime = data.primary_datetime;
  if (data.service) vars.service = data.service;
  if (data.customer_name) vars.customer_name = data.customer_name;
  if (data.party_size != null) vars.party_size = String(data.party_size);
  if (data.special_request) vars.special_request = data.special_request;
  if (data.scenario_type) vars.scenario_type = data.scenario_type;

  return vars;
}

// --- System Prompt Builder ---

function buildSystemPrompt(data: CollectedData): string {
  const sections: string[] = [
    buildIdentitySection(),
    buildObjectiveSection(data),
    buildKeyInfoSection(data),
    buildConversationFlowSection(data),
    buildFallbackSection(data),
    buildEndingSection(),
    buildRulesSection(),
  ];

  return sections.join('\n\n');
}

// --- Section Builders ---

function buildIdentitySection(): string {
  return `You are a friendly AI phone assistant making a call on behalf of a customer.
You MUST speak in Korean (한국어) using polite speech (해요체).

## Your Identity
- You are calling on behalf of a customer who uses the WIGVO app
- Be polite, clear, and efficient
- Speak naturally like a human assistant, not like a robot
- Keep your sentences concise and easy to understand

## 통화 연결 시 (매우 중요)
- 전화가 연결되면 **상대방이 먼저 말할 때까지 1~2초 기다리세요.** ("네, OOO입니다", "여보세요" 등)
- 상대가 인사나 회사명을 말하는 동안 **절대 말을 끼어넣지 마세요.** 말이 겹치면 통화가 끊길 수 있습니다.
- 상대방이 말을 **끝낸 뒤** 그제서야 "안녕하세요" 또는 용건을 말하세요.`;
}

function buildObjectiveSection(data: CollectedData): string {
  const targetName = data.target_name || '상대방';

  switch (data.scenario_type) {
    case 'RESERVATION': {
      const parts = [`Make a reservation at ${targetName}`];
      if (data.primary_datetime) parts.push(`for ${data.primary_datetime}`);
      if (data.service) parts.push(`(${data.service})`);
      return `## Call Objective\n${parts.join(' ')}.`;
    }

    case 'INQUIRY': {
      const subject = data.service || '서비스';
      const detail = data.special_request
        ? `\nSpecific question: ${data.special_request}`
        : '';
      return `## Call Objective\nInquire about ${subject} at ${targetName}.${detail}`;
    }

    case 'AS_REQUEST': {
      const product = data.service || '제품';
      const issue = data.special_request
        ? `\nIssue description: ${data.special_request}`
        : '';
      return `## Call Objective\nRequest AS/repair service at ${targetName} for ${product}.${issue}`;
    }

    default: {
      return `## Call Objective\nContact ${targetName} regarding ${data.service || '용건'}.`;
    }
  }
}

function buildKeyInfoSection(data: CollectedData): string {
  const lines: string[] = ['## Key Information'];

  if (data.target_name) lines.push(`- Target: ${data.target_name}`);
  if (data.service) lines.push(`- Service: ${data.service}`);
  if (data.primary_datetime) lines.push(`- Preferred Time: ${data.primary_datetime}`);
  if (data.customer_name) lines.push(`- Customer Name: ${data.customer_name}`);
  if (data.party_size != null) lines.push(`- Party Size: ${data.party_size}명`);
  if (data.special_request) lines.push(`- Special Request: ${data.special_request}`);

  if (data.fallback_datetimes.length > 0) {
    lines.push(`- Alternative Times: ${data.fallback_datetimes.join(', ')}`);
  }

  return lines.join('\n');
}

function buildConversationFlowSection(data: CollectedData): string {
  switch (data.scenario_type) {
    case 'RESERVATION':
      return buildReservationFlow(data);
    case 'INQUIRY':
      return buildInquiryFlow(data);
    case 'AS_REQUEST':
      return buildAsRequestFlow(data);
    default:
      return buildReservationFlow(data);
  }
}

function buildReservationFlow(data: CollectedData): string {
  const service = data.service || '예약';
  const datetime = data.primary_datetime || '요청한 시간';
  const customerName = data.customer_name || '고객';

  const steps: string[] = [
    `1. Greeting: "안녕하세요, ${service} 문의 드립니다."`,
    `2. Request: "${datetime}에 ${service} 예약 가능할까요?"`,
  ];

  let stepNum = 3;

  if (data.party_size != null) {
    steps.push(`${stepNum}. If asked about party size: "${data.party_size}명입니다."`);
    stepNum++;
  }

  steps.push(
    `${stepNum}. If asked for name: "예약자 이름은 ${customerName}입니다."`,
  );
  stepNum++;

  steps.push(`${stepNum}. Confirm the final reservation details before ending.`);

  return `## Conversation Flow\n${steps.join('\n')}`;
}

function buildInquiryFlow(data: CollectedData): string {
  const service = data.service || '서비스';

  const steps: string[] = [
    `1. Greeting: "안녕하세요, ${service} 관련해서 문의드릴 게 있어서 전화드렸습니다."`,
    `2. Ask your question clearly and wait for the answer.`,
  ];

  if (data.special_request) {
    steps.push(`3. Specific question to ask: "${data.special_request}"`);
    steps.push(`4. Listen carefully and note the answer.`);
    steps.push(`5. Thank them: "알려주셔서 감사합니다."`);
  } else {
    steps.push(`3. Ask about availability, pricing, or other relevant details.`);
    steps.push(`4. Thank them for the information.`);
  }

  return `## Conversation Flow\n${steps.join('\n')}`;
}

function buildAsRequestFlow(data: CollectedData): string {
  const service = data.service || '제품';
  const datetime = data.primary_datetime || '가능한 시간';

  const steps: string[] = [
    `1. Greeting: "안녕하세요, ${service} AS 접수하려고 전화드렸습니다."`,
  ];

  if (data.special_request) {
    steps.push(`2. Describe the issue: "${data.special_request}"`);
  } else {
    steps.push(`2. Describe the issue with ${service}.`);
  }

  steps.push(`3. Request a visit: "${datetime}에 방문 가능하실까요?"`);
  steps.push(`4. Confirm the appointment details and any required preparation.`);

  return `## Conversation Flow\n${steps.join('\n')}`;
}

function buildFallbackSection(data: CollectedData): string {
  const lines: string[] = ['## Fallback Handling'];

  // No fallback info at all
  if (data.fallback_datetimes.length === 0 && !data.fallback_action) {
    lines.push(
      'If the requested time is unavailable, politely end the call and report back.',
    );
    lines.push('Say: "알겠습니다. 확인해서 다시 연락드릴게요."');
    return lines.join('\n');
  }

  lines.push('If the requested time is unavailable:');

  let step = 1;

  // Alternative times
  if (data.fallback_datetimes.length > 0) {
    const alternatives = data.fallback_datetimes.join(', ');
    lines.push(
      `${step}. Try these alternative times in order: ${alternatives}`,
    );
    step++;
  }

  // Fallback action
  switch (data.fallback_action) {
    case 'ASK_AVAILABLE':
      lines.push(
        `${step}. Ask "그럼 언제가 가능하세요?" and note the available times to report back.`,
      );
      step++;
      break;

    case 'NEXT_DAY':
      lines.push(
        `${step}. Ask if the next day works: "그럼 다음 날은 가능할까요?"`,
      );
      step++;
      break;

    case 'CANCEL':
      lines.push(
        `${step}. If no alternatives work, politely end the call: "알겠습니다. 감사합니다."`,
      );
      step++;
      break;
  }

  // Final fallback
  lines.push(
    `${step}. If none of the above works, say "알겠습니다. 확인해서 다시 연락드릴게요." and end the call.`,
  );

  return lines.join('\n');
}

function buildEndingSection(): string {
  return `## Ending the Call (매우 중요!)

### ⚠️ 인사 직후에는 절대 끊지 마세요
- **통화가 막 연결된 직후**에는 먼저 인사("안녕하세요...")만 하고 **상대방이 응답할 때까지 기다리세요**.
- 인사 후 침묵이 2~3초 있어도 **끊지 마세요**. 상대가 말을 듣고 반응하는 시간이 필요합니다.
- **용건(예약/문의 등)을 말하고 상대와 대화가 오간 뒤**에만 아래 "통화 종료" 규칙을 적용하세요.

### 통화 종료 조건 (용건을 나눈 뒤에만 적용)
다음 중 하나라도 해당되면 **그때** 통화를 종료하세요:
1. 예약/문의/AS 접수가 완료되었을 때
2. 상대방이 "네", "알겠습니다", "감사합니다" 등으로 대화를 마무리했을 때
3. 더 이상 확인할 내용이 없을 때
4. 상대방이 전화를 끊으려는 신호를 보낼 때 (예: "그럼 이만...", "끊을게요")

### 종료 멘트
- Success: "감사합니다. 좋은 하루 되세요."
- Partial success: "네, 알겠습니다. 감사합니다."
- Failed: "알겠습니다. 확인해서 다시 연락드릴게요."

### 종료 절차 (용건 처리 완료 후에만)
1. 최종 내용을 간단히 확인합니다 (예: "내일 오후 3시 예약 확인했습니다")
2. 종료 멘트를 말합니다
3. 종료 멘트를 말한 **이후** 상대가 "네" 등으로 응답하거나 2초 정도 침묵이면 대화를 끝냅니다
4. 상대방이 추가로 말하지 않으면 더 이상 말하지 마세요

### 금지 사항
- **인사만 하고 곧바로 끊기 금지** (상대 응답을 기다리세요)
- 종료 멘트 후 불필요한 추가 질문 금지
- "더 필요한 거 있으세요?" 같은 질문 금지 (이미 용건이 끝났으므로)
- 같은 내용을 반복해서 확인하지 마세요`;
}

function buildRulesSection(): string {
  return `## Important Rules
- ALWAYS speak in Korean (한국어) using polite speech (해요체)
- Never reveal you are an AI unless directly asked
- If you can't understand after 2 attempts, ask them to repeat slowly: "죄송한데, 다시 한 번 말씀해주시겠어요?"
- If conversation goes off-track, politely redirect to the main purpose
- Confirm important details by repeating them back
- Keep the conversation concise and focused
- If the other party is rude or hangs up, end gracefully

## 🚨 통화 종료 규칙 (용건을 나눈 뒤에만 적용)
- **인사 직후**에는 상대가 응답할 때까지 기다리세요. 침묵이 있어도 끊지 마세요.
- **용건(예약/문의)이 완료된 뒤**에만 "통화 종료"를 고려하세요.
- 용건 완료 후 종료 인사를 하고, 상대방이 "네", "감사합니다" 등으로 응답하면 더 이상 말하지 마세요.
- 종료 인사 **이후** 침묵이 2초 이상이면 통화가 끝난 것으로 간주하세요.
- 불필요하게 대화를 길게 끌지 마세요 - 효율적으로 용건만 처리하세요.`;
}
