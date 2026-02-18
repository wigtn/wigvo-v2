'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createConversation,
  getConversation,
  sendChatMessage,
  createCall,
  startCall,
} from '@/lib/api';
import { validateMessage } from '@/lib/validation';
import type {
  Message,
  CollectedData,
  ConversationStatus,
  ScenarioType,
  ScenarioSubType,
} from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import { DEFAULT_LANGUAGE_PAIR } from '@/shared/call-types';
import { createEmptyCollectedData } from '@/shared/types';
import { useDashboard } from '@/hooks/useDashboard';
import {
  STORAGE_KEY_CONVERSATION_ID,
  ERROR_AUTO_DISMISS_MS,
} from '@/lib/constants';

const STORAGE_KEY_COMMUNICATION_MODE = 'currentCommunicationMode';
const STORAGE_KEY_SOURCE_LANG = 'currentSourceLang';
const STORAGE_KEY_TARGET_LANG = 'currentTargetLang';

interface UseChatReturn {
  conversationId: string | null;
  messages: Message[];
  collectedData: CollectedData | null;
  isComplete: boolean;
  isLoading: boolean;
  isInitializing: boolean;
  conversationStatus: ConversationStatus;
  // v5: 모드 + 시나리오 선택 관련
  scenarioSelected: boolean;
  selectedScenario: ScenarioType | null;
  selectedSubType: ScenarioSubType | null;
  communicationMode: CommunicationMode | null;
  sourceLang: string;
  targetLang: string;
  handleScenarioSelect: (scenarioType: ScenarioType, subType: ScenarioSubType, communicationMode: CommunicationMode, sourceLang: string, targetLang: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  handleConfirm: () => Promise<void>;
  handleEdit: () => void;
  handleNewConversation: () => Promise<void>;
  error: string | null;
}

export function useChat(): UseChatReturn {
  const router = useRouter();

  // ── Dashboard State ─────────────────────────────────────────
  const { searchResults, setSearchResults, setSelectedPlace, setMapCenter, setMapZoom, setIsSearching, setCallingCallId, setCallingCommunicationMode, resetCalling, resetDashboard } = useDashboard();

  // ── State ───────────────────────────────────────────────────
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [collectedData, setCollectedData] = useState<CollectedData | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [conversationStatus, setConversationStatus] = useState<ConversationStatus>('COLLECTING');
  const [error, setError] = useState<string | null>(null);
  
  // v5: 모드 + 시나리오 선택 상태
  const [scenarioSelected, setScenarioSelected] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);
  const [selectedSubType, setSelectedSubType] = useState<ScenarioSubType | null>(null);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode | null>(null);
  const [sourceLang, setSourceLang] = useState(DEFAULT_LANGUAGE_PAIR.source.code);
  const [targetLang, setTargetLang] = useState(DEFAULT_LANGUAGE_PAIR.target.code);

  // ── Refs (StrictMode 이중 초기화 방지) ─────────────────────
  const initializedRef = useRef(false);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helper: 에러 설정 (5초 후 자동 디스미스) ───────────────
  const setErrorWithAutoDismiss = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setError(msg);
    errorTimerRef.current = setTimeout(() => setError(null), ERROR_AUTO_DISMISS_MS);
  }, []);

  // ── Helper: 401 에러 처리 ──────────────────────────────────
  const handle401 = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_CONVERSATION_ID);
    router.push('/login');
  }, [router]);

  // ── startConversation (v5: 모드 + 시나리오 타입 + 언어 지원) ───────
  const startConversation = useCallback(async (
    scenarioType?: ScenarioType,
    subType?: ScenarioSubType,
    mode?: CommunicationMode,
    srcLang?: string,
    tgtLang?: string
  ) => {
    try {
      const data = await createConversation(scenarioType, subType, mode, srcLang, tgtLang);
      setConversationId(data.id);
      setConversationStatus(data.status);
      setCollectedData(data.collectedData ?? createEmptyCollectedData());
      setIsComplete(false);

      // v5: 모드 + 시나리오 선택 상태 업데이트
      if (scenarioType && subType) {
        setScenarioSelected(true);
        setSelectedScenario(scenarioType);
        setSelectedSubType(subType);
      }
      if (mode) {
        setCommunicationMode(mode);
        localStorage.setItem(STORAGE_KEY_COMMUNICATION_MODE, mode);
      }
      if (srcLang) {
        setSourceLang(srcLang);
        localStorage.setItem(STORAGE_KEY_SOURCE_LANG, srcLang);
      }
      if (tgtLang) {
        setTargetLang(tgtLang);
        localStorage.setItem(STORAGE_KEY_TARGET_LANG, tgtLang);
      }

      // greeting 메시지 추가
      if (data.greeting) {
        setMessages([
          {
            id: `greeting-${data.id}`,
            role: 'assistant',
            content: data.greeting,
            createdAt: data.createdAt,
          },
        ]);
      }

      localStorage.setItem(STORAGE_KEY_CONVERSATION_ID, data.id);
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        handle401();
        return;
      }
      setErrorWithAutoDismiss('대화를 시작하지 못했습니다. 새로고침 해주세요.');
    }
  }, [handle401, setErrorWithAutoDismiss]);

  // ── resumeConversation (v4: 시나리오 상태 복원) ────────────
  const resumeConversation = useCallback(
    async (id: string) => {
      try {
        const data = await getConversation(id);

        // 이미 완료된 대화면 새로 시작 (모드 선택 화면으로)
        if (data.status === 'COMPLETED' || data.status === 'CALLING') {
          localStorage.removeItem(STORAGE_KEY_CONVERSATION_ID);
          localStorage.removeItem(STORAGE_KEY_COMMUNICATION_MODE);
          localStorage.removeItem(STORAGE_KEY_SOURCE_LANG);
          localStorage.removeItem(STORAGE_KEY_TARGET_LANG);
          // v5: 모드 선택 화면으로 돌아감
          setScenarioSelected(false);
          setSelectedScenario(null);
          setSelectedSubType(null);
          setCommunicationMode(null);
          setSourceLang(DEFAULT_LANGUAGE_PAIR.source.code);
          setTargetLang(DEFAULT_LANGUAGE_PAIR.target.code);
          setIsInitializing(false);
          return;
        }

        setConversationId(data.id);
        setConversationStatus(data.status);
        setCollectedData(data.collectedData ?? createEmptyCollectedData());
        setIsComplete(data.status === 'READY');
        setMessages(data.messages ?? []);

        // v5: 모드 + 시나리오 + 언어 상태 복원
        const savedMode = localStorage.getItem(STORAGE_KEY_COMMUNICATION_MODE) as CommunicationMode | null;
        if (savedMode) {
          setCommunicationMode(savedMode);
        }
        const savedSourceLang = localStorage.getItem(STORAGE_KEY_SOURCE_LANG);
        const savedTargetLang = localStorage.getItem(STORAGE_KEY_TARGET_LANG);
        if (savedSourceLang) setSourceLang(savedSourceLang);
        if (savedTargetLang) setTargetLang(savedTargetLang);

        if (data.collectedData?.scenario_type && data.collectedData?.scenario_sub_type) {
          setScenarioSelected(true);
          setSelectedScenario(data.collectedData.scenario_type);
          setSelectedSubType(data.collectedData.scenario_sub_type);
        } else {
          setScenarioSelected(false);
          setSelectedScenario(null);
          setSelectedSubType(null);
        }
      } catch (err) {
        if (err instanceof Error && err.message === 'Unauthorized') {
          handle401();
          return;
        }
        // 404 또는 기타 에러: localStorage 삭제 후 모드 선택 화면으로
        localStorage.removeItem(STORAGE_KEY_CONVERSATION_ID);
        localStorage.removeItem(STORAGE_KEY_COMMUNICATION_MODE);
        localStorage.removeItem(STORAGE_KEY_SOURCE_LANG);
        localStorage.removeItem(STORAGE_KEY_TARGET_LANG);
        setScenarioSelected(false);
        setSelectedScenario(null);
        setSelectedSubType(null);
        setCommunicationMode(null);
        setSourceLang(DEFAULT_LANGUAGE_PAIR.source.code);
        setTargetLang(DEFAULT_LANGUAGE_PAIR.target.code);
      }
    },
    [handle401]
  );

  // ── 초기화 (v4: 시나리오 선택 화면부터 시작) ────────────────
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const init = async () => {
      setIsInitializing(true);
      const savedId = localStorage.getItem(STORAGE_KEY_CONVERSATION_ID);

      if (savedId) {
        // 기존 대화 복원 시도
        await resumeConversation(savedId);
      } else {
        // v5: 새 대화는 모드 선택 화면부터 시작
        setScenarioSelected(false);
        setSelectedScenario(null);
        setSelectedSubType(null);
        setCommunicationMode(null);
      }

      setIsInitializing(false);
    };

    init();
  }, [resumeConversation]);
  
  // ── handleScenarioSelect (v5: 모드 + 시나리오 + 언어 선택 후 대화 시작) ───
  const handleScenarioSelect = useCallback(async (
    scenarioType: ScenarioType,
    subType: ScenarioSubType,
    mode: CommunicationMode,
    srcLang: string,
    tgtLang: string
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      await startConversation(scenarioType, subType, mode, srcLang, tgtLang);
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        handle401();
        return;
      }
      setErrorWithAutoDismiss('대화를 시작하지 못했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  }, [startConversation, handle401, setErrorWithAutoDismiss]);

  // ── sendMessage (Optimistic update + rollback) ─────────────
  const sendMessage = useCallback(
    async (content: string) => {
      // 유효성 검사
      const validation = validateMessage(content);
      if (!validation.valid) {
        setErrorWithAutoDismiss(validation.error ?? '입력이 올바르지 않습니다.');
        return;
      }

      if (!conversationId) {
        setErrorWithAutoDismiss('대화가 시작되지 않았습니다.');
        return;
      }

      setError(null);

      // 1. Optimistic: 사용자 메시지 즉시 추가
      const optimisticMsg: Message = {
        id: `temp-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticMsg]);
      setIsLoading(true);

      try {
        // 2. API 호출 (이전 검색 결과 + 통화 모드 함께 전달)
        setIsSearching(true);
        const currentSearchResults = useDashboard.getState().searchResults;
        const data = await sendChatMessage(
          conversationId,
          content.trim(),
          currentSearchResults.length > 0 ? currentSearchResults : undefined,
          communicationMode || undefined
        );
        setIsSearching(false);

        // 3. 성공: assistant 메시지 추가 + collected 데이터 업데이트
        const assistantMsg: Message = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.message,
          createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setCollectedData(data.collected);
        // 서버가 READY면 카드 표시 보장 (파싱 누락 시에도)
        const ready = data.is_complete || data.conversation_status === 'READY';
        setIsComplete(ready);
        setConversationStatus(data.conversation_status);

        // 4. 대시보드 상태 업데이트 (검색 결과가 있으면)
        const newSearchResults = data.search_results ?? [];
        const isNewSearch = newSearchResults.length > 0;
        const prevResults = useDashboard.getState().searchResults;
        if (isNewSearch) {
          setSearchResults(newSearchResults);
          // 새 검색이면 이전 선택 초기화
          setSelectedPlace(null);
        }
        if (data.map_center) {
          setMapCenter(data.map_center);
        }

        // 4-1. 선택된 장소 자동 매칭
        const latestResults = isNewSearch ? newSearchResults : prevResults;
        if (latestResults.length > 0) {
          let matched = null;

          // 새 검색 결과가 1건이면 바로 선택 (사용자가 특정 장소를 지정한 경우)
          if (isNewSearch && newSearchResults.length === 1) {
            matched = newSearchResults[0];
          }

          if (!matched) {
            const targetName = data.collected?.target_name;
            if (targetName) {
              // 1순위: collected에 target_name이 있으면 직접 매칭
              matched = latestResults.find((r: { name: string }) =>
                r.name.includes(targetName) || targetName.includes(r.name)
              );
            }
          }

          if (!matched && !isNewSearch) {
            // 2순위: 사용자 메시지에서 번호 선택 감지 ("1번", "2번" 등) - 기존 결과에서만
            const userMsg = content.trim();
            const numMatch = userMsg.match(/^(\d)(?:번|$)/);
            if (numMatch) {
              const idx = parseInt(numMatch[1], 10) - 1;
              if (idx >= 0 && idx < latestResults.length) {
                matched = latestResults[idx];
              }
            }
          }

          if (!matched) {
            // 3순위: 사용자 메시지에서 가게명 매칭
            matched = latestResults.find((r: { name: string }) =>
              content.includes(r.name) || r.name.includes(content.replace(/으로|에|로|할게|예약|선택|갈게|해줘/g, '').trim())
            );
          }

          if (!matched) {
            // 4순위: AI 응답 메시지에서 가게명 매칭
            matched = latestResults.find((r: { name: string }) => data.message.includes(r.name));
          }

          if (matched) {
            setSelectedPlace(matched);
          }
        }
        
        // 5. 위치 컨텍스트 업데이트 (검색 결과 없을 때 위치 감지)
        if (data.location_context?.coordinates) {
          setMapCenter(data.location_context.coordinates);
          // 줌 레벨도 업데이트 (상세해질수록 확대)
          if (data.location_context.zoom_level) {
            setMapZoom(data.location_context.zoom_level);
          }
        }
      } catch (err) {
        setIsSearching(false);
        // 4. 실패: rollback — optimistic 메시지 제거
        setMessages((prev) => prev.filter((m) => m.id !== optimisticMsg.id));

        if (err instanceof Error && err.message === 'Unauthorized') {
          handle401();
          return;
        }
        setErrorWithAutoDismiss('메시지 전송에 실패했습니다. 다시 시도해주세요.');
      } finally {
        setIsLoading(false);
      }
    },
    [conversationId, communicationMode, handle401, setErrorWithAutoDismiss]
  );

  // ── handleConfirm: 전화 걸기 (더블클릭 방지 포함) ─────────
  const confirmingRef = useRef(false);
  const handleConfirm = useCallback(async () => {
    if (!conversationId || confirmingRef.current) return;
    confirmingRef.current = true;

    setIsLoading(true);
    setError(null);

    try {
      // 1. Call 생성 (저장된 communicationMode 사용)
      const call = await createCall(conversationId, communicationMode || undefined);

      // 2. Call 시작
      await startCall(call.id);

      // 3. 인라인 calling 상태로 전환 (페이지 이동 없음)
      setCallingCallId(call.id);
      setCallingCommunicationMode(communicationMode || null);
    } catch (err) {
      if (err instanceof Error && err.message === 'Unauthorized') {
        handle401();
        return;
      }
      setErrorWithAutoDismiss('전화 걸기에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
      confirmingRef.current = false;
    }
  }, [conversationId, communicationMode, handle401, setCallingCallId, setCallingCommunicationMode, setErrorWithAutoDismiss]);

  // ── handleEdit: 수정하기 ──────────────────────────────────
  const handleEdit = useCallback(() => {
    setIsComplete(false);
    setConversationStatus('COLLECTING');

    const editMsg: Message = {
      id: `system-edit-${Date.now()}`,
      role: 'assistant',
      content: '수정할 내용을 말씀해주세요.',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, editMsg]);
  }, []);

  // ── handleNewConversation: 새 대화 시작 (v5: 모드 선택 화면으로) ─
  const handleNewConversation = useCallback(async () => {
    localStorage.removeItem(STORAGE_KEY_CONVERSATION_ID);
    localStorage.removeItem(STORAGE_KEY_COMMUNICATION_MODE);
    localStorage.removeItem(STORAGE_KEY_SOURCE_LANG);
    localStorage.removeItem(STORAGE_KEY_TARGET_LANG);
    setMessages([]);
    setCollectedData(null);
    setIsComplete(false);
    setConversationStatus('COLLECTING');
    setConversationId(null);
    setError(null);
    // v5: 모드 선택 화면으로 돌아감
    setScenarioSelected(false);
    setSelectedScenario(null);
    setSelectedSubType(null);
    setCommunicationMode(null);
    setSourceLang(DEFAULT_LANGUAGE_PAIR.source.code);
    setTargetLang(DEFAULT_LANGUAGE_PAIR.target.code);
    // 대시보드 초기화 (지도, 검색결과, 통화)
    resetDashboard();
    resetCalling();
  }, [resetCalling]);

  return {
    conversationId,
    messages,
    collectedData,
    isComplete,
    isLoading,
    isInitializing,
    conversationStatus,
    // v5: 모드 + 시나리오 선택 관련
    scenarioSelected,
    selectedScenario,
    selectedSubType,
    communicationMode,
    sourceLang,
    targetLang,
    handleScenarioSelect,
    sendMessage,
    handleConfirm,
    handleEdit,
    handleNewConversation,
    error,
  };
}
