// =============================================================================
// Place Matcher — match user selection to search results
// =============================================================================

import { type NaverPlaceResult } from '@/lib/naver-maps';

export interface PlaceMatchResult {
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
