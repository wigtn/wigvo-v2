import type { Language } from '../types.js';

// ── Politeness Rules ──
export const politenessRules: Record<`${Language}->${Language}`, string> = {
  'en->ko':
    'ALWAYS use polite Korean (해요체/존댓말). ' +
    "Use '사장님', '선생님' for addressing. " +
    "Never use 반말 or casual speech endings like ~해, ~야, ~냐.",
  'ko->en':
    "Use polite, professional English. " +
    "Use 'sir', 'ma'am' when appropriate. " +
    'Maintain a warm but respectful tone.',
  'ko->ko':
    'ALWAYS use polite Korean (해요체/존댓말). ' +
    "Use '사장님', '선생님' for addressing. " +
    'Speak naturally as a polite Korean assistant.',
  'en->en':
    'Use polite, professional English. ' +
    'Maintain a warm but respectful tone.',
};

// ── Cultural Adaptation Rules ──
export const culturalRules: Record<`${Language}->${Language}`, string> = {
  'en->ko':
    "Use indirect requests: '~해주실 수 있을까요?' instead of direct commands. " +
    "For time, use Korean format: '오후 3시'. " +
    "For addresses, use Korean order: 구 → 동 → 번지.",
  'ko->en':
    "Convert Korean-specific terms with context: '만원' → '10,000 won (~$7.50)'. " +
    "Convert '평' → 'pyeong (3.3 sq meters)'. " +
    "Explain cultural references briefly in parentheses.",
  'ko->ko': '',
  'en->en': '',
};

// ── First Message Templates ──
export const firstMessageTemplates: Record<Language, string> = {
  ko: '안녕하세요. AI 통역 서비스를 이용해서 연락드렸습니다. 고객님을 대신해서 통화를 도와드리고 있어요.',
  en: "Hello, this is an AI translation assistant calling on behalf of a customer. I'll relay their message shortly.",
};

// ── First Message Templates (Agent Mode — no translation) ──
export const firstMessageAgentTemplates: Record<Language, string> = {
  ko: '안녕하세요. {{service}} 관련해서 연락드렸습니다.',
  en: 'Hello, I am calling regarding {{service}}.',
};

// ── Filler Phrases ──
export const fillerPhrases: Record<Language, string[]> = {
  ko: [
    '잠시만요, 확인해 볼게요.',
    '잠시만 기다려 주세요.',
    '네, 잠깐만요.',
  ],
  en: [
    'One moment please, let me check.',
    'Please hold on a moment.',
    'Just a second.',
  ],
};

// ── Term Explanation Rules ──
export const termExplanationRules: Record<`${Language}->${Language}`, string> = {
  'ko->en':
    "'만원' → '10,000 won (~$7.50)', '평' → 'pyeong (3.3 sq meters)', " +
    "'보증금' → 'deposit (보증금)'",
  'en->ko':
    "'deposit' → '보증금(deposit)', 'lease' → '임대 계약(lease)', " +
    "'check-in' → '체크인(check-in)'",
  'ko->ko': '',
  'en->en': '',
};
