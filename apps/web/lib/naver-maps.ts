// =============================================================================
// WIGVO Naver Maps Integration (v4)
// =============================================================================
// BE1 소유 - 네이버지도 API를 통한 장소 검색 + 위치 감지
// Phase 4: 대화 중 위치 키워드 실시간 감지 → 지도 자동 업데이트
// =============================================================================

import {
  getCachedSearchResults,
  saveSearchResultsToCache,
} from '@/lib/supabase/cache';

/**
 * 네이버지도 검색 결과
 */
export interface NaverPlaceResult {
  name: string;
  address: string;
  roadAddress: string;
  telephone: string;
  category: string;
  mapx: number;
  mapy: number;
}

/**
 * 위치 컨텍스트 (대화 중 감지된 위치 정보)
 */
export interface LocationContext {
  region: string | null;        // 지역명 (예: "강남역", "홍대", "서울시 강남구")
  place_name: string | null;    // 상호명 (예: "OO미용실", "강남면옥")
  address: string | null;       // 주소 (예: "서울시 강남구 역삼동 123")
  coordinates: {                // 변환된 좌표
    lat: number;
    lng: number;
  } | null;
  zoom_level: number;           // 추천 줌 레벨 (지역: 14, 동네: 16, 상호: 17)
  confidence: 'low' | 'medium' | 'high';  // 위치 확신도
}

/**
 * 네이버지도 장소 검색 (캐싱 적용)
 * 
 * @param query - 검색어 (예: "강남역 미용실")
 * @param location - 사용자 위치 (선택적, 있으면 거리순 정렬)
 * @param useCache - 캐시 사용 여부 (기본값: true)
 * @returns 검색 결과 목록 (최대 5개)
 */
export async function searchNaverPlaces(
  query: string,
  location?: { lat: number; lng: number },
  useCache: boolean = true
): Promise<NaverPlaceResult[]> {
  // 1. 캐시 확인 (위치 정보 없는 경우에만 캐시 사용)
  if (useCache && !location) {
    try {
      const cachedResults = await getCachedSearchResults(query);
      if (cachedResults && cachedResults.length > 0) {
        console.log(`[Naver Maps] Cache hit for query: "${query}"`);
        return cachedResults;
      }
    } catch (cacheError) {
      // 캐시 조회 실패해도 계속 진행
      console.warn('[Naver Maps] Cache lookup failed:', cacheError);
    }
  }

  // 2. API 키 확인
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('Naver API credentials not configured. Skipping place search.');
    return [];
  }

  // 3. API 호출
  try {
    const params = new URLSearchParams({
      query,
      display: '5', // 최대 5개 결과
      sort: location ? 'distance' : 'random', // 위치가 있으면 거리순, 없으면 랜덤
    });

    if (location) {
      params.append('lat', String(location.lat));
      params.append('lng', String(location.lng));
    }

    const response = await fetch(
      `https://openapi.naver.com/v1/search/local.json?${params}`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );

    if (!response.ok) {
      console.error(`Naver API error: ${response.statusText}`);
      return [];
    }

    const data = await response.json();

    const results: NaverPlaceResult[] = (data.items || []).map((item: any) => ({
      name: item.title.replace(/<[^>]*>/g, ''), // HTML 태그 제거
      address: item.address || '',
      roadAddress: item.roadAddress || '',
      telephone: item.telephone || '',
      category: item.category || '',
      mapx: parseFloat(item.mapx) || 0,
      mapy: parseFloat(item.mapy) || 0,
    }));

    // 4. 결과 캐싱 (위치 정보 없는 경우에만)
    if (useCache && !location && results.length > 0) {
      try {
        await saveSearchResultsToCache(query, results);
        console.log(`[Naver Maps] Cached ${results.length} results for query: "${query}"`);
      } catch (cacheError) {
        // 캐싱 실패해도 결과는 반환
        console.warn('[Naver Maps] Failed to cache results:', cacheError);
      }
    }

    return results;
  } catch (error) {
    console.error('Failed to search Naver places:', error);
    return [];
  }
}

/**
 * 사용자 메시지에서 장소 검색 필요 여부 판단
 * 
 * @param message - 사용자 메시지
 * @param hasPhoneNumber - 이미 전화번호가 수집되었는지
 * @returns 검색 필요 여부
 */
export function shouldSearchPlaces(message: string, hasPhoneNumber: boolean): boolean {
  // 이미 전화번호가 있으면 검색 불필요
  if (hasPhoneNumber) {
    return false;
  }

  // 검색 키워드
  const searchKeywords = [
    '근처',
    '주변',
    '찾아',
    '검색',
    '어디',
    '직방',
    '네이버',
    '다음',
    '카카오맵',
    '지도',
    '알려줘',
    '알려',
  ];

  // 장소명 패턴 (예: "OO미용실", "XX식당")
  const placeNamePattern = /[가-힣]{2,10}(미용실|식당|병원|카페|마트|센터|매장|점|상가)/;

  // 전화번호 패턴 (없어야 검색 필요)
  const phonePattern = /\d{2,3}-\d{3,4}-\d{4}/;

  const hasKeyword = searchKeywords.some((kw) => message.includes(kw));
  const hasPlaceName = placeNamePattern.test(message);
  const hasNoPhone = !phonePattern.test(message);

  return hasKeyword || (hasPlaceName && hasNoPhone);
}

/**
 * 사용자 메시지에서 검색어 추출
 * 
 * @param message - 사용자 메시지
 * @returns 추출된 검색어
 */
export function extractSearchQuery(message: string): string {
  // "강남역 근처 미용실" → "강남역 미용실"
  // "직방에서 본 빌라" → "직방 빌라"
  
  // 불필요한 단어 제거
  const stopWords = ['근처', '주변', '에서', '본', '알려줘', '알려', '찾아'];
  
  let query = message;
  stopWords.forEach((word) => {
    query = query.replace(new RegExp(word, 'g'), '');
  });
  
  // 공백 정리
  query = query.trim().replace(/\s+/g, ' ');
  
  return query;
}

// =============================================================================
// 위치 감지 기능 (Phase 4)
// =============================================================================

/**
 * 주요 지역/랜드마크 좌표 (오프라인 캐시)
 * - API 호출 없이 빠르게 좌표 반환
 * - 자주 언급되는 지역 위주
 */
const KNOWN_LOCATIONS: Record<string, { lat: number; lng: number; zoom: number }> = {
  // 서울 주요 지역
  '강남역': { lat: 37.4979, lng: 127.0276, zoom: 16 },
  '강남': { lat: 37.4979, lng: 127.0276, zoom: 15 },
  '홍대': { lat: 37.5563, lng: 126.9220, zoom: 16 },
  '홍대입구': { lat: 37.5563, lng: 126.9220, zoom: 16 },
  '신촌': { lat: 37.5598, lng: 126.9425, zoom: 16 },
  '이태원': { lat: 37.5345, lng: 126.9946, zoom: 16 },
  '명동': { lat: 37.5636, lng: 126.9869, zoom: 16 },
  '종로': { lat: 37.5704, lng: 126.9922, zoom: 15 },
  '동대문': { lat: 37.5712, lng: 127.0095, zoom: 16 },
  '신사동': { lat: 37.5239, lng: 127.0228, zoom: 16 },
  '가로수길': { lat: 37.5209, lng: 127.0230, zoom: 17 },
  '압구정': { lat: 37.5270, lng: 127.0286, zoom: 16 },
  '청담동': { lat: 37.5247, lng: 127.0474, zoom: 16 },
  '잠실': { lat: 37.5133, lng: 127.1001, zoom: 15 },
  '건대': { lat: 37.5404, lng: 127.0696, zoom: 16 },
  '건대입구': { lat: 37.5404, lng: 127.0696, zoom: 16 },
  '왕십리': { lat: 37.5614, lng: 127.0378, zoom: 16 },
  '성수동': { lat: 37.5447, lng: 127.0558, zoom: 16 },
  '여의도': { lat: 37.5219, lng: 126.9245, zoom: 15 },
  '마포': { lat: 37.5538, lng: 126.9522, zoom: 15 },
  '합정': { lat: 37.5496, lng: 126.9139, zoom: 16 },
  '망원동': { lat: 37.5565, lng: 126.9100, zoom: 16 },
  '연남동': { lat: 37.5660, lng: 126.9250, zoom: 16 },
  '서울역': { lat: 37.5547, lng: 126.9707, zoom: 16 },
  '용산': { lat: 37.5299, lng: 126.9648, zoom: 15 },
  '이촌동': { lat: 37.5168, lng: 126.9713, zoom: 16 },
  '노원': { lat: 37.6555, lng: 127.0616, zoom: 15 },
  '목동': { lat: 37.5263, lng: 126.8750, zoom: 15 },
  '영등포': { lat: 37.5171, lng: 126.9077, zoom: 15 },
  
  // 서울 외 주요 도시
  '판교': { lat: 37.3947, lng: 127.1112, zoom: 15 },
  '분당': { lat: 37.3825, lng: 127.1195, zoom: 14 },
  '일산': { lat: 37.6580, lng: 126.7726, zoom: 14 },
  '인천': { lat: 37.4563, lng: 126.7052, zoom: 13 },
  '수원': { lat: 37.2636, lng: 127.0286, zoom: 13 },
  '대전': { lat: 36.3504, lng: 127.3845, zoom: 13 },
  '대구': { lat: 35.8714, lng: 128.6014, zoom: 13 },
  '부산': { lat: 35.1796, lng: 129.0756, zoom: 13 },
  '광주': { lat: 35.1595, lng: 126.8526, zoom: 13 },
  '제주': { lat: 33.4996, lng: 126.5312, zoom: 12 },
  '해운대': { lat: 35.1631, lng: 129.1635, zoom: 15 },
  '서면': { lat: 35.1578, lng: 129.0599, zoom: 16 },
};

/**
 * 텍스트에서 위치 키워드 추출 (검색/추천 요청 제외)
 * 
 * @param text - 분석할 텍스트 (사용자 메시지 또는 수집된 데이터)
 * @returns 추출된 위치 키워드 목록
 */
export function extractLocationKeywords(text: string): string[] {
  // 검색/추천 요청 키워드가 있으면 빈 배열 반환 (다른 팀원 담당)
  const searchRequestKeywords = ['추천', '찾아줘', '검색해줘', '알려줘', '어디가', '어디 있'];
  if (searchRequestKeywords.some(kw => text.includes(kw))) {
    return [];
  }

  const keywords: string[] = [];
  
  // 1. 알려진 지역명 매칭
  for (const location of Object.keys(KNOWN_LOCATIONS)) {
    if (text.includes(location)) {
      keywords.push(location);
    }
  }
  
  // 2. 주소 패턴 매칭 (예: "서울시 강남구", "강남구 역삼동")
  const addressPatterns = [
    /([가-힣]+시)\s*([가-힣]+구)/g,  // 서울시 강남구
    /([가-힣]+구)\s*([가-힣]+동)/g,  // 강남구 역삼동
    /([가-힣]+동)\s*\d+/g,           // 역삼동 123
  ];
  
  for (const pattern of addressPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      keywords.push(...matches);
    }
  }
  
  // 3. 역/터미널/공항 패턴
  const stationPattern = /([가-힣]+)(역|터미널|공항|버스터미널)/g;
  const stationMatches = text.match(stationPattern);
  if (stationMatches) {
    keywords.push(...stationMatches);
  }
  
  // 중복 제거
  return [...new Set(keywords)];
}

/**
 * 위치 키워드를 좌표로 변환
 * 
 * @param keyword - 위치 키워드 (예: "강남역", "서울시 강남구")
 * @returns 좌표 및 줌 레벨 (없으면 null)
 */
export async function resolveLocationToCoordinates(
  keyword: string
): Promise<{ lat: number; lng: number; zoom: number } | null> {
  // 1. 오프라인 캐시에서 먼저 확인 (API 호출 절약)
  const knownLocation = KNOWN_LOCATIONS[keyword];
  if (knownLocation) {
    console.log(`[Location] Cache hit for "${keyword}"`);
    return knownLocation;
  }
  
  // 2. 부분 매칭 시도 (예: "강남역 근처" → "강남역")
  for (const [name, coords] of Object.entries(KNOWN_LOCATIONS)) {
    if (keyword.includes(name)) {
      console.log(`[Location] Partial match: "${keyword}" → "${name}"`);
      return coords;
    }
  }
  
  // 3. 네이버 Local Search API로 검색 (API 키가 있을 때만)
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.log(`[Location] No API key, skipping search for "${keyword}"`);
    return null;
  }
  
  try {
    const params = new URLSearchParams({
      query: keyword,
      display: '1',
    });
    
    const response = await fetch(
      `https://openapi.naver.com/v1/search/local.json?${params}`,
      {
        headers: {
          'X-Naver-Client-Id': clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
      }
    );
    
    if (!response.ok) {
      return null;
    }
    
    const data = await response.json();
    const item = data.items?.[0];
    
    if (item && item.mapx && item.mapy) {
      // 네이버 API는 KATEC 좌표 반환 → WGS84 변환 필요
      let lat = parseFloat(item.mapy);
      let lng = parseFloat(item.mapx);
      
      // KATEC 좌표인 경우 변환 (값이 큰 경우)
      if (lat > 1000000) {
        lat = lat / 10000000;
        lng = lng / 10000000;
      }
      
      console.log(`[Location] API resolved "${keyword}" → (${lat}, ${lng})`);
      return { lat, lng, zoom: 16 };
    }
  } catch (error) {
    console.error(`[Location] Failed to resolve "${keyword}":`, error);
  }
  
  return null;
}

/**
 * 수집된 데이터에서 위치 컨텍스트 추출 및 좌표 변환
 * 
 * @param collectedData - 수집된 데이터 (target_name, special_request 등)
 * @param userMessage - 현재 사용자 메시지
 * @returns 위치 컨텍스트 (좌표 포함)
 */
export async function extractLocationContext(
  collectedData: {
    target_name?: string | null;
    special_request?: string | null;
  },
  userMessage: string
): Promise<LocationContext | null> {
  // 검색/추천 요청이면 null 반환 (다른 팀원 담당)
  const searchRequestKeywords = ['추천', '찾아줘', '검색해줘', '알려줘', '어디가', '어디 있'];
  if (searchRequestKeywords.some(kw => userMessage.includes(kw))) {
    return null;
  }

  // 위치 키워드 추출 (우선순위: 사용자 메시지 > target_name > special_request)
  const allText = [
    userMessage,
    collectedData.target_name || '',
    collectedData.special_request || '',
  ].join(' ');
  
  const keywords = extractLocationKeywords(allText);
  
  if (keywords.length === 0) {
    return null;
  }
  
  // 가장 구체적인 키워드 선택 (길이가 긴 것 = 더 구체적)
  const bestKeyword = keywords.sort((a, b) => b.length - a.length)[0];
  
  // 좌표 변환
  const coords = await resolveLocationToCoordinates(bestKeyword);
  
  if (!coords) {
    return null;
  }
  
  // 확신도 결정
  let confidence: 'low' | 'medium' | 'high' = 'low';
  if (collectedData.target_name && keywords.some(k => collectedData.target_name?.includes(k))) {
    confidence = 'high';
  } else if (keywords.length > 1) {
    confidence = 'medium';
  }
  
  return {
    region: bestKeyword,
    place_name: collectedData.target_name || null,
    address: null,
    coordinates: {
      lat: coords.lat,
      lng: coords.lng,
    },
    zoom_level: coords.zoom,
    confidence,
  };
}
