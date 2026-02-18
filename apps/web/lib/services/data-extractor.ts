// =============================================================================
// Data Extractor — extract structured data from user messages (fallback)
// =============================================================================

import { CollectedData } from '@/shared/types';

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
