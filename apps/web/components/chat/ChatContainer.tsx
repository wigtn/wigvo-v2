"use client";

import { useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useChat } from "@/hooks/useChat";
import { useDashboard } from "@/hooks/useDashboard";
import ChatMessage from "./ChatMessage";
import ChatInput, { type ChatInputHandle } from "./ChatInput";
import CollectionSummary from "./CollectionSummary";
import ScenarioSelector from "./ScenarioSelector";
import { Phone, Loader2, Plus, PhoneCall } from "lucide-react";

export default function ChatContainer() {
  const {
    messages,
    collectedData,
    isComplete,
    conversationStatus,
    isLoading,
    isInitializing,
    scenarioSelected,
    communicationMode,
    handleScenarioSelect,
    sendMessage,
    handleConfirm,
    handleEdit,
    handleNewConversation,
    error,
  } = useChat();

  const t = useTranslations("chat");
  const tc = useTranslations("common");

  const { callingCallId } = useDashboard();
  const isCalling = !!callingCallId;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const prevLoadingRef = useRef(isLoading);

  // 스크롤 + 포커스
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // AI 답변 완료 후 입력창 자동 포커스
  useEffect(() => {
    if (prevLoadingRef.current && !isLoading && !isComplete && !isCalling) {
      chatInputRef.current?.focus();
    }
    prevLoadingRef.current = isLoading;
  }, [isLoading, isComplete, isCalling]);

  if (isInitializing) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="size-8 text-[#0F172A] animate-spin" />
        <p className="text-sm text-[#94A3B8]">{t("loadingConversation")}</p>
      </div>
    );
  }

  // 시나리오 선택 화면
  if (!scenarioSelected) {
    return (
      <div className="flex flex-col h-full bg-white">
        <ScenarioSelector
          onSelect={handleScenarioSelect}
          disabled={isLoading}
        />
        {error && (
          <div className="mx-4 mb-4 text-center">
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">
              {error}
            </p>
          </div>
        )}
        {isLoading && (
          <div className="flex justify-center pb-4">
            <Loader2 className="size-5 text-[#0F172A] animate-spin" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* 채팅 헤더 - 새 대화 버튼 */}
      <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <Phone className="size-3.5 text-[#64748B]" />
          <span className="text-xs font-medium text-[#64748B]">{t("header")}</span>
        </div>
        <button
          type="button"
          onClick={handleNewConversation}
          disabled={isLoading || isCalling}
          className="flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors disabled:opacity-40"
        >
          <Plus className="size-3.5" />
          {tc("newChat")}
        </button>
      </div>

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto styled-scrollbar px-5 pt-4 pb-2">
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}

        {/* 로딩 */}
        {isLoading && !isCalling && (
          <div className="flex justify-start mb-3">
            <div className="max-w-[80%] rounded-2xl rounded-bl-md px-4 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0]">
              <div className="text-[10px] text-[#64748B] font-medium mb-1.5 uppercase tracking-wider">
                {tc("agent")}
              </div>
              <div className="flex items-center gap-1 text-[#94A3B8] text-sm">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                <span className="ml-1">{t("typing")}</span>
              </div>
            </div>
          </div>
        )}

        {/* 에러 */}
        {error && (
          <div className="mb-3 text-center">
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 inline-block">
              {error}
            </p>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      {/* 통화 중 인디케이터 */}
      {isCalling && (
        <div className="mx-4 mb-2 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] p-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0F172A] flex items-center justify-center">
              <PhoneCall className="size-4 text-white animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0F172A]">{t("callingInProgress")}</p>
              <p className="text-xs text-[#94A3B8]">{t("callingHint")}</p>
            </div>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-teal-500" />
            </span>
          </div>
        </div>
      )}

      {/* 수집 완료 시 요약 카드 */}
      {!isCalling && collectedData && (isComplete || conversationStatus === "READY") && (
        <CollectionSummary
          data={collectedData}
          communicationMode={communicationMode}
          onConfirm={handleConfirm}
          onEdit={handleEdit}
          onNewConversation={handleNewConversation}
          isLoading={isLoading}
        />
      )}

      {/* 입력창 */}
      <ChatInput
        ref={chatInputRef}
        onSend={sendMessage}
        disabled={isLoading || isComplete || isCalling}
        placeholder={
          isCalling
            ? t("callingPlaceholder")
            : isComplete
              ? t("completePlaceholder")
              : t("placeholder")
        }
      />
    </div>
  );
}
