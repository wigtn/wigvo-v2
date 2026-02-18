'use client';

import type { CollectedData, ConversationStatus } from '@/shared/types';
import { Zap, Phone, MapPin, Calendar, Scissors, User, Users, FileText, ChevronRight } from 'lucide-react';

interface AgentSidebarProps {
  status: ConversationStatus;
  collectedData: CollectedData | null;
  isComplete: boolean;
  onNewConversation: () => void;
}

const STATUS_MAP: Record<ConversationStatus, { label: string; color: string; dot: string }> = {
  COLLECTING: { label: '정보 수집 중', color: 'text-amber-600', dot: 'bg-amber-500' },
  READY: { label: '전화 준비 완료', color: 'text-teal-600', dot: 'bg-teal-500' },
  CALLING: { label: '통화 중', color: 'text-violet-600', dot: 'bg-violet-500' },
  COMPLETED: { label: '완료', color: 'text-[#94A3B8]', dot: 'bg-[#94A3B8]' },
  CANCELLED: { label: '취소됨', color: 'text-[#94A3B8]', dot: 'bg-[#94A3B8]' },
};

const REQUIRED_FIELDS = [
  { key: 'scenario_type', label: '용건 유형', icon: FileText },
  { key: 'target_name', label: '전화할 곳', icon: MapPin },
  { key: 'target_phone', label: '전화번호', icon: Phone },
  { key: 'primary_datetime', label: '날짜/시간', icon: Calendar },
] as const;

const OPTIONAL_FIELDS = [
  { key: 'service', label: '서비스', icon: Scissors },
  { key: 'customer_name', label: '예약자', icon: User },
  { key: 'party_size', label: '인원', icon: Users },
] as const;

export default function AgentSidebar({
  status,
  collectedData,
  isComplete,
  onNewConversation,
}: AgentSidebarProps) {
  const statusInfo = STATUS_MAP[status] || STATUS_MAP.COLLECTING;

  const filledRequired = REQUIRED_FIELDS.filter(
    (f) => collectedData && collectedData[f.key] !== null && collectedData[f.key] !== undefined
  ).length;

  return (
    <aside className="w-72 shrink-0 border-r border-[#E2E8F0] bg-white flex flex-col h-full overflow-y-auto styled-scrollbar">
      {/* 에이전트 상태 */}
      <div className="p-5 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center">
            <Zap className="size-5 text-violet-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#0F172A]">Voice Agent</h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <div className={`w-1.5 h-1.5 rounded-full ${statusInfo.dot} ${status === 'COLLECTING' || status === 'CALLING' ? 'animate-pulse' : ''}`} />
              <span className={`text-[11px] font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
            </div>
          </div>
        </div>

        {/* 수집 진행률 */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-[#94A3B8] uppercase tracking-wider font-medium">수집 진행률</span>
            <span className="text-[10px] text-[#64748B] font-mono">{filledRequired}/4</span>
          </div>
          <div className="h-1 bg-[#F1F5F9] rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${(filledRequired / 4) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* 필수 정보 */}
      <div className="p-5 border-b border-[#E2E8F0]">
        <h4 className="text-[10px] text-[#94A3B8] uppercase tracking-wider font-medium mb-3">필수 정보</h4>
        <div className="space-y-2">
          {REQUIRED_FIELDS.map(({ key, label, icon: Icon }) => {
            const value = collectedData?.[key];
            const filled = value !== null && value !== undefined;
            return (
              <div key={key} className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${filled ? 'bg-teal-50' : 'bg-[#F1F5F9]'}`}>
                  <Icon className={`size-3 ${filled ? 'text-teal-600' : 'text-[#CBD5E1]'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-[11px] truncate ${filled ? 'text-[#334155]' : 'text-[#CBD5E1]'}`}>
                    {filled ? String(value) : label}
                  </div>
                </div>
                {filled && (
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 추가 정보 */}
      <div className="p-5 border-b border-[#E2E8F0]">
        <h4 className="text-[10px] text-[#94A3B8] uppercase tracking-wider font-medium mb-3">추가 정보</h4>
        <div className="space-y-2">
          {OPTIONAL_FIELDS.map(({ key, label, icon: Icon }) => {
            const raw = collectedData?.[key];
            const value = raw !== null && raw !== undefined ? String(raw) : null;
            return (
              <div key={key} className="flex items-center gap-2.5">
                <div className={`w-6 h-6 rounded-md flex items-center justify-center ${value ? 'bg-violet-50' : 'bg-[#F1F5F9]'}`}>
                  <Icon className={`size-3 ${value ? 'text-violet-600' : 'text-[#CBD5E1]'}`} />
                </div>
                <span className={`text-[11px] ${value ? 'text-[#334155]' : 'text-[#CBD5E1]'}`}>
                  {value || label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 하단 액션 */}
      <div className="mt-auto p-5">
        {isComplete && (
          <div className="mb-3 p-3 rounded-lg bg-teal-50 border border-teal-200">
            <p className="text-[11px] text-teal-700 font-medium">전화할 준비가 되었습니다</p>
            <p className="text-[10px] text-teal-600/60 mt-0.5">채팅 영역에서 &apos;전화 걸기&apos;를 눌러주세요</p>
          </div>
        )}
        <button
          onClick={onNewConversation}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-[11px] text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F1F5F9] transition-colors"
        >
          <span>새 에이전트 세션</span>
          <ChevronRight className="size-3" />
        </button>
      </div>
    </aside>
  );
}
