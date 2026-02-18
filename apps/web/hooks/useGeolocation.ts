// =============================================================================
// WIGVO Geolocation Hook (v3)
// =============================================================================
// FE1 소유 - 웹 브라우저 위치 정보 수집
// Phase 3: 네이버지도 검색 시 거리순 정렬을 위한 위치 정보
// =============================================================================

'use client';

import { useState, useCallback, useEffect } from 'react';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export interface GeolocationPosition {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: number;
}

export interface GeolocationState {
  position: GeolocationPosition | null;
  error: string | null;
  loading: boolean;
  supported: boolean;
}

// -----------------------------------------------------------------------------
// useGeolocation Hook
// -----------------------------------------------------------------------------
/**
 * 웹 브라우저 Geolocation API 훅
 * 
 * @param autoFetch - 마운트 시 자동으로 위치 요청 (기본값: false)
 * @returns 위치 정보 상태 및 요청 함수
 */
export function useGeolocation(autoFetch: boolean = false) {
  const [state, setState] = useState<GeolocationState>({
    position: null,
    error: null,
    loading: false,
    supported: typeof window !== 'undefined' && 'geolocation' in navigator,
  });

  // 위치 요청 함수
  const requestPosition = useCallback(() => {
    if (!state.supported) {
      setState((prev) => ({
        ...prev,
        error: '이 브라우저는 위치 정보를 지원하지 않습니다.',
      }));
      return;
    }

    setState((prev) => ({ ...prev, loading: true, error: null }));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setState({
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          },
          error: null,
          loading: false,
          supported: true,
        });
      },
      (error) => {
        let errorMessage: string;
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = '위치 정보 접근이 거부되었습니다.';
            break;
          case error.POSITION_UNAVAILABLE:
            errorMessage = '위치 정보를 사용할 수 없습니다.';
            break;
          case error.TIMEOUT:
            errorMessage = '위치 정보 요청 시간이 초과되었습니다.';
            break;
          default:
            errorMessage = '위치 정보를 가져오는 중 오류가 발생했습니다.';
        }
        setState((prev) => ({
          ...prev,
          error: errorMessage,
          loading: false,
        }));
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000, // 1분 캐시
      }
    );
  }, [state.supported]);

  // 자동 요청
  useEffect(() => {
    if (autoFetch && state.supported && !state.position && !state.loading) {
      requestPosition();
    }
  }, [autoFetch, state.supported, state.position, state.loading, requestPosition]);

  return {
    ...state,
    requestPosition,
  };
}
