"use client";

import { useCallback, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Menu, Map, MessageSquare, Phone } from "lucide-react";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import Sidebar from "./Sidebar";
import MobileDrawer from "./MobileDrawer";
import ChatContainer from "@/components/chat/ChatContainer";
import NaverMapContainer from "@/components/map/NaverMapContainer";
import PlaceInfoPanel from "@/components/place/PlaceInfoPanel";
import RelayCallProvider from "@/components/call/RelayCallProvider";
import CallEffectPanel from "@/components/call/CallEffectPanel";
import ConversationHistoryPanel from "@/components/chat/ConversationHistoryPanel";
import PricingPanel from "./PricingPanel";
import { useDashboard } from "@/hooks/useDashboard";
import { useChat } from "@/hooks/useChat";
import { cn } from "@/lib/utils";

export default function DashboardLayout() {
  const {
    activeMenu,
    mapCenter,
    mapZoom,
    searchResults,
    selectedPlace,
    setSelectedPlace,
    isSearching,
    setActiveConversationId,
    setSidebarOpen,
    resetDashboard,
    callingCallId,
    callingCommunicationMode,
  } = useDashboard();

  const { handleNewConversation, scenarioSelected } = useChat();
  const t = useTranslations("dashboard");

  const [mobileTab, setMobileTab] = useState<"chat" | "map" | "calling">(
    "chat",
  );
  const isCalling = !!callingCallId;

  // calling 시작 시 모바일에서 자동 탭 전환
  useEffect(() => {
    if (isCalling) {
      setMobileTab("calling");
    }
  }, [isCalling]);

  const onNewConversation = useCallback(async () => {
    resetDashboard();
    await handleNewConversation();
    setMobileTab("chat");
  }, [resetDashboard, handleNewConversation]);

  const onSelectConversation = useCallback(
    (id: string) => {
      setActiveConversationId(id);
    },
    [setActiveConversationId],
  );

  return (
    <div className="flex h-full bg-[#F8FAFC]">
      {/* 데스크톱 사이드바 */}
      <div className="hidden lg:block">
        <Sidebar
          onNewConversation={onNewConversation}
          onSelectConversation={onSelectConversation}
        />
      </div>

      {/* 모바일 드로어 */}
      <MobileDrawer
        onNewConversation={onNewConversation}
        onSelectConversation={onSelectConversation}
      />

      {/* 메인 콘텐츠 */}
      {activeMenu === "pricing" ? (
        /* 요금제 전체 영역 */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 모바일 헤더 (메뉴 버튼만) */}
          <div className="lg:hidden flex items-center px-4 py-2 bg-white border-b border-[#E2E8F0]">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
            >
              <Menu className="size-5 text-[#64748B]" />
            </button>
          </div>

          {/* 요금제 패널 */}
          <div className="flex-1 overflow-hidden lg:p-4">
            <div className="h-full lg:bg-white lg:rounded-2xl lg:border lg:border-[#E2E8F0] lg:shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <PricingPanel />
            </div>
          </div>
        </div>
      ) : activeMenu === "conversations" ? (
        /* 대화 기록 전체 영역 */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* 모바일 헤더 (메뉴 버튼만) */}
          <div className="lg:hidden flex items-center px-4 py-2 bg-white border-b border-[#E2E8F0]">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
            >
              <Menu className="size-5 text-[#64748B]" />
            </button>
          </div>

          {/* 대화 기록 패널 */}
          <div className="flex-1 overflow-hidden lg:p-4">
            <div className="h-full lg:bg-white lg:rounded-2xl lg:border lg:border-[#E2E8F0] lg:shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <ConversationHistoryPanel />
            </div>
          </div>
        </div>
      ) : (
        /* 채팅 + 지도 2-column 레이아웃 */
        <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-4 p-0 lg:p-4 overflow-hidden">
          {/* 모바일 헤더 (시나리오 선택 전: 메뉴+언어만 / 선택 후: 탭 전환) */}
          <div className="lg:hidden flex items-center justify-between px-4 py-2 bg-white border-b border-[#E2E8F0]">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-[#F1F5F9] rounded-lg transition-colors"
            >
              <Menu className="size-5 text-[#64748B]" />
            </button>

            {scenarioSelected && (
              <div className="flex bg-[#F1F5F9] rounded-xl p-1">
                <button
                  onClick={() => setMobileTab("chat")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    mobileTab === "chat"
                      ? "bg-white text-[#0F172A] shadow-sm"
                      : "text-[#94A3B8]",
                  )}
                >
                  <MessageSquare className="size-4" />
                  {t("tabChat")}
                </button>
                {isCalling ? (
                  <button
                    onClick={() => setMobileTab("calling")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      mobileTab === "calling"
                        ? "bg-white text-[#0F172A] shadow-sm"
                        : "text-[#94A3B8]",
                    )}
                  >
                    <Phone className="size-4" />
                    {t("tabCalling")}
                  </button>
                ) : (
                  <button
                    onClick={() => setMobileTab("map")}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                      mobileTab === "map"
                        ? "bg-white text-[#0F172A] shadow-sm"
                        : "text-[#94A3B8]",
                    )}
                  >
                    <Map className="size-4" />
                    {t("tabMap")}
                  </button>
                )}
              </div>
            )}

            <LanguageSwitcher />
          </div>

          {/* 좌측: 채팅 카드 (시나리오 미선택 시 전체 너비) */}
          <div
            className={cn(
              "h-full transition-all duration-500 ease-in-out",
              !scenarioSelected && !isCalling && searchResults.length === 0 ? "lg:w-full" : "lg:w-1/2",
              mobileTab === "chat" ? "flex-1" : "hidden lg:block",
            )}
          >
            <div className="h-full bg-white lg:rounded-2xl lg:border lg:border-[#E2E8F0] lg:shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <ChatContainer />
            </div>
          </div>

          {/* 우측: 이펙트 패널 (calling 중) */}
          <div
            className={cn(
              "h-full transition-all duration-500 ease-in-out overflow-hidden",
              isCalling
                ? cn(
                    "lg:w-1/2",
                    mobileTab === "calling" ? "flex-1" : "hidden lg:block",
                  )
                : "lg:w-0 lg:opacity-0 hidden",
            )}
          >
            {isCalling && callingCallId && (
              <RelayCallProvider
                key={callingCallId}
                callingCallId={callingCallId}
                communicationMode={callingCommunicationMode ?? 'voice_to_voice'}
              >
                <div className="h-full bg-white lg:rounded-2xl lg:border lg:border-[#E2E8F0] lg:shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
                  <CallEffectPanel />
                </div>
              </RelayCallProvider>
            )}
          </div>
          {/* 우측: 지도 + 장소 정보 카드 (시나리오 선택 후에만 표시) */}
          <div
            className={cn(
              "h-full flex flex-col gap-2 lg:gap-4 p-2 lg:p-0 transition-all duration-500 ease-in-out overflow-hidden",
              isCalling || (!scenarioSelected && searchResults.length === 0)
                ? "lg:w-0 lg:opacity-0 hidden"
                : cn(
                    "lg:w-1/2",
                    mobileTab === "map" ? "flex-1" : "hidden lg:flex",
                  ),
            )}
          >
            <div className="min-h-0" style={{ flex: '2 1 0%' }}>
              <NaverMapContainer
                center={mapCenter}
                zoom={mapZoom}
                markers={searchResults}
                selectedPlace={selectedPlace}
                onMarkerClick={setSelectedPlace}
              />
            </div>

            <div className="min-h-0" style={{ flex: '3 1 0%' }}>
              <PlaceInfoPanel
                results={searchResults}
                selected={selectedPlace}
                onSelect={setSelectedPlace}
                isSearching={isSearching}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
