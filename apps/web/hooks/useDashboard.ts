'use client';

import { create } from 'zustand';
import type { NaverPlaceResult } from '@/lib/naver-maps';
import type { CommunicationMode } from '@/shared/call-types';

// 대화 요약 (사이드바용)
export interface ConversationSummary {
  id: string;
  status: string;
  targetName: string | null;
  lastMessage: string;
  createdAt: string;
}

interface DashboardState {
  // 사이드바
  isSidebarOpen: boolean;
  isSidebarCollapsed: boolean;
  activeMenu: 'chat' | 'conversations' | 'reservations' | 'pricing';

  // 지도
  mapCenter: { lat: number; lng: number } | null;
  mapZoom: number;

  // 장소 정보
  searchResults: NaverPlaceResult[];
  selectedPlace: NaverPlaceResult | null;
  isSearching: boolean;

  // 대화 목록
  conversations: ConversationSummary[];
  activeConversationId: string | null;

  // 통화 상태 (인라인)
  callingCallId: string | null;
  callingCommunicationMode: CommunicationMode | null;

  // Actions
  setSidebarOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setActiveMenu: (menu: 'chat' | 'conversations' | 'reservations' | 'pricing') => void;
  setMapCenter: (center: { lat: number; lng: number } | null) => void;
  setMapZoom: (zoom: number) => void;
  setSearchResults: (results: NaverPlaceResult[]) => void;
  setSelectedPlace: (place: NaverPlaceResult | null) => void;
  setIsSearching: (searching: boolean) => void;
  setConversations: (conversations: ConversationSummary[]) => void;
  setActiveConversationId: (id: string | null) => void;
  setCallingCallId: (id: string | null) => void;
  setCallingCommunicationMode: (mode: CommunicationMode | null) => void;

  // 복합 액션
  updateFromChatResponse: (searchResults?: NaverPlaceResult[], mapCenter?: { lat: number; lng: number } | null) => void;
  resetDashboard: () => void;
  resetCalling: () => void;
}

// 기본 중심점 (서울 시청)
const DEFAULT_CENTER = { lat: 37.5665, lng: 126.9780 };

export const useDashboard = create<DashboardState>((set) => ({
  // Initial state
  isSidebarOpen: true,
  isSidebarCollapsed: false,
  activeMenu: 'chat',
  mapCenter: DEFAULT_CENTER,
  mapZoom: 15,
  searchResults: [],
  selectedPlace: null,
  isSearching: false,
  conversations: [],
  activeConversationId: null,
  callingCallId: null,
  callingCommunicationMode: null,

  // Actions
  setSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setSidebarCollapsed: (collapsed) => set({ isSidebarCollapsed: collapsed }),
  setActiveMenu: (menu) => set({ activeMenu: menu }),
  setMapCenter: (center) => set({ mapCenter: center }),
  setMapZoom: (zoom) => set({ mapZoom: zoom }),
  setSearchResults: (results) => set({ searchResults: results }),
  setSelectedPlace: (place) => set({ selectedPlace: place }),
  setIsSearching: (searching) => set({ isSearching: searching }),
  setConversations: (conversations) => set({ conversations }),
  setActiveConversationId: (id) => set({ activeConversationId: id }),
  setCallingCallId: (id) => set({ callingCallId: id }),
  setCallingCommunicationMode: (mode) => set({ callingCommunicationMode: mode }),

  // 복합 액션: 채팅 응답에서 지도/검색 결과 업데이트
  updateFromChatResponse: (searchResults, mapCenter) =>
    set((state) => ({
      searchResults: searchResults ?? state.searchResults,
      mapCenter: mapCenter ?? state.mapCenter,
      selectedPlace: searchResults && searchResults.length > 0 ? searchResults[0] : state.selectedPlace,
    })),

  // 대시보드 초기화
  resetDashboard: () =>
    set({
      mapCenter: DEFAULT_CENTER,
      mapZoom: 15,
      searchResults: [],
      selectedPlace: null,
      isSearching: false,
    }),

  // 통화 상태 초기화
  resetCalling: () =>
    set({
      callingCallId: null,
      callingCommunicationMode: null,
    }),
}));
