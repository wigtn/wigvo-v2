// =============================================================================
// WIGVO Place Search Cache Functions (v3)
// =============================================================================
// BE1 소유 - 네이버지도 검색 결과 캐싱
// Phase 3: API 할당량 절약을 위한 캐시 관리
// =============================================================================

import { createClient } from './server';
import { NaverPlaceResult } from '@/lib/naver-maps';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
interface PlaceSearchCache {
  id: string;
  query_hash: string;
  query_text: string;
  results: NaverPlaceResult[];
  created_at: string;
  expires_at: string;
}

// -----------------------------------------------------------------------------
// hashQuery
// -----------------------------------------------------------------------------
/**
 * 검색어를 해시값으로 변환 (간단한 해시 함수)
 * 
 * @param query - 검색어
 * @returns 해시값
 */
export function hashQuery(query: string): string {
  // 검색어 정규화: 소문자 변환, 공백 정리
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  
  // 간단한 해시 생성 (djb2 알고리즘)
  let hash = 5381;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 33) ^ normalized.charCodeAt(i);
  }
  
  return `hash_${(hash >>> 0).toString(16)}`;
}

// -----------------------------------------------------------------------------
// getCachedSearchResults
// -----------------------------------------------------------------------------
/**
 * 캐시된 검색 결과 조회
 * 
 * @param query - 검색어
 * @returns 캐시된 결과 또는 null
 */
export async function getCachedSearchResults(
  query: string
): Promise<NaverPlaceResult[] | null> {
  const supabase = await createClient();
  const queryHash = hashQuery(query);

  const { data, error } = await supabase
    .from('place_search_cache')
    .select('*')
    .eq('query_hash', queryHash)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error || !data) {
    return null;
  }

  return (data as PlaceSearchCache).results;
}

// -----------------------------------------------------------------------------
// saveSearchResultsToCache
// -----------------------------------------------------------------------------
/**
 * 검색 결과를 캐시에 저장
 * 
 * @param query - 검색어
 * @param results - 검색 결과
 * @param ttlDays - 캐시 유효 기간 (일, 기본값: 7일)
 */
export async function saveSearchResultsToCache(
  query: string,
  results: NaverPlaceResult[],
  ttlDays: number = 7
): Promise<void> {
  const supabase = await createClient();
  const queryHash = hashQuery(query);
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + ttlDays);

  const { error } = await supabase
    .from('place_search_cache')
    .upsert(
      {
        query_hash: queryHash,
        query_text: query,
        results,
        expires_at: expiresAt.toISOString(),
      },
      {
        onConflict: 'query_hash',
      }
    );

  if (error) {
    console.error('Failed to save search results to cache:', error);
  }
}

// -----------------------------------------------------------------------------
// cleanupExpiredCache
// -----------------------------------------------------------------------------
/**
 * 만료된 캐시 삭제
 */
export async function cleanupExpiredCache(): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('place_search_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) {
    console.error('Failed to cleanup expired cache:', error);
    return 0;
  }

  return data?.length || 0;
}

// -----------------------------------------------------------------------------
// getCacheStats
// -----------------------------------------------------------------------------
/**
 * 캐시 통계 조회
 */
export async function getCacheStats(): Promise<{
  totalEntries: number;
  expiredEntries: number;
}> {
  const supabase = await createClient();

  const { count: totalCount } = await supabase
    .from('place_search_cache')
    .select('*', { count: 'exact', head: true });

  const { count: expiredCount } = await supabase
    .from('place_search_cache')
    .select('*', { count: 'exact', head: true })
    .lt('expires_at', new Date().toISOString());

  return {
    totalEntries: totalCount || 0,
    expiredEntries: expiredCount || 0,
  };
}
