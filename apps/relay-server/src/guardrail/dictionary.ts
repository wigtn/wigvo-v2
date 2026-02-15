/**
 * Banned/correction word dictionary for guardrail system.
 * Maps informal/inappropriate expressions to formal corrections.
 */

// Korean banned words (profanity, slurs)
export const BANNED_WORDS_KO: string[] = [
  '시발', '씨발', '씨팔', '시팔', '개새끼', '병신', '지랄', '좆', '엿먹어',
  '닥쳐', '꺼져', '미친놈', '미친년', '새끼', '찐따',
];

// Informal speech patterns (반말) that should be 해요체
export const INFORMAL_PATTERNS_KO: { pattern: RegExp; replacement: string }[] = [
  { pattern: /해라$/u, replacement: '해 주세요' },
  { pattern: /해$/u, replacement: '해요' },
  { pattern: /가$/u, replacement: '가세요' },
  { pattern: /와$/u, replacement: '와요' },
  { pattern: /봐$/u, replacement: '봐요' },
  { pattern: /줘$/u, replacement: '줘요' },
  { pattern: /먹어$/u, replacement: '드세요' },
  { pattern: /자$/u, replacement: '자요' },
  { pattern: /알았어$/u, replacement: '알겠습니다' },
  { pattern: /뭐\?$/u, replacement: '뭐라고 하셨나요?' },
  { pattern: /응$/u, replacement: '네' },
  { pattern: /어$/u, replacement: '어요' },
];

// English informal/inappropriate patterns
export const INFORMAL_PATTERNS_EN: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bshut up\b/gi, replacement: 'please wait a moment' },
  { pattern: /\bwhatever\b/gi, replacement: 'I understand' },
  { pattern: /\byeah\b/gi, replacement: 'yes' },
  { pattern: /\bnah\b/gi, replacement: 'no' },
  { pattern: /\bgonna\b/gi, replacement: 'going to' },
  { pattern: /\bwanna\b/gi, replacement: 'want to' },
  { pattern: /\bgotta\b/gi, replacement: 'have to' },
];

/**
 * Check if text contains banned words.
 */
export function containsBannedWord(text: string, language: 'ko' | 'en'): boolean {
  const lower = text.toLowerCase();
  if (language === 'ko') {
    return BANNED_WORDS_KO.some((word) => lower.includes(word));
  }
  return false;
}

/**
 * Apply informal-to-formal corrections.
 * Returns corrected text and whether any corrections were applied.
 */
export function applyFormalCorrections(
  text: string,
  language: 'ko' | 'en',
): { corrected: string; wasChanged: boolean } {
  const patterns = language === 'ko' ? INFORMAL_PATTERNS_KO : INFORMAL_PATTERNS_EN;
  let result = text;
  let wasChanged = false;

  for (const { pattern, replacement } of patterns) {
    const newResult = result.replace(pattern, replacement);
    if (newResult !== result) {
      wasChanged = true;
      result = newResult;
    }
  }

  return { corrected: result, wasChanged };
}
