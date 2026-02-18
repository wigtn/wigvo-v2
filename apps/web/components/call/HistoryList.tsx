'use client';

import { useRouter } from 'next/navigation';
import { Phone, Calendar, HelpCircle, Search, ChevronRight, Inbox } from 'lucide-react';
import { type Call, type CallStatus } from '@/shared/types';
import type { ReactNode } from 'react';

interface HistoryListProps {
  calls: Call[];
}

interface StatusBadge {
  label: string;
  dotColor: string;
  bg: string;
  text: string;
}

function getStatusBadge(status: CallStatus, result: string | null): StatusBadge {
  if (status === 'COMPLETED') {
    return result === 'SUCCESS'
      ? { label: '성공', dotColor: 'bg-teal-500', bg: 'bg-teal-50', text: 'text-teal-700' }
      : { label: '실패', dotColor: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700' };
  }
  if (status === 'FAILED') {
    return { label: '실패', dotColor: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700' };
  }
  if (status === 'CALLING' || status === 'IN_PROGRESS') {
    return { label: '통화중', dotColor: 'bg-[#0F172A] animate-pulse', bg: 'bg-[#F1F5F9]', text: 'text-[#0F172A]' };
  }
  return { label: '대기', dotColor: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' };
}

function getRequestTypeLabel(type: string): string {
  switch (type) {
    case 'RESERVATION': return '예약';
    case 'INQUIRY': return '문의';
    case 'CONFIRMATION': return '확인';
    default: return type;
  }
}

function getRequestTypeIcon(type: string): ReactNode {
  switch (type) {
    case 'RESERVATION': return <Calendar className="size-4 text-[#64748B]" />;
    case 'INQUIRY': return <HelpCircle className="size-4 text-[#64748B]" />;
    case 'CONFIRMATION': return <Search className="size-4 text-[#64748B]" />;
    default: return <Phone className="size-4 text-[#64748B]" />;
  }
}

function formatCreatedAt(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${month}/${day} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

function getNavigationTarget(call: Call): string {
  if (call.status === 'COMPLETED' || call.status === 'FAILED') {
    return `/result/${call.id}`;
  }
  return `/calling/${call.id}`;
}

export default function HistoryList({ calls }: HistoryListProps) {
  const router = useRouter();

  if (calls.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center">
          <Inbox className="size-6 text-[#CBD5E1]" />
        </div>
        <p className="text-sm font-medium text-[#94A3B8]">아직 통화 기록이 없습니다</p>
        <p className="text-xs text-[#CBD5E1]">채팅에서 전화를 요청해보세요</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {calls.map((call) => {
        const badge = getStatusBadge(call.status, call.result);
        const icon = getRequestTypeIcon(call.requestType);
        return (
          <button
            key={call.id}
            onClick={() => router.push(getNavigationTarget(call))}
            className="flex w-full items-center gap-3 rounded-2xl bg-white border border-[#E2E8F0] p-4 text-left hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition-all active:scale-[0.99]"
          >
            {/* 아이콘 */}
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F1F5F9]">
              {icon}
            </div>

            {/* 정보 */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-sm font-semibold text-[#0F172A]">{call.targetName}</span>
              <div className="flex items-center gap-1.5 text-[11px] text-[#94A3B8]">
                <span>{getRequestTypeLabel(call.requestType)}</span>
                <span className="text-[#CBD5E1]">·</span>
                <span>{formatCreatedAt(call.createdAt)}</span>
              </div>
            </div>

            {/* 상태 뱃지 */}
            <div className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 ${badge.bg}`}>
              <span className={`inline-block h-1.5 w-1.5 rounded-full ${badge.dotColor}`} />
              <span className={`text-[10px] font-medium ${badge.text}`}>{badge.label}</span>
            </div>

            {/* 화살표 */}
            <ChevronRight className="size-4 shrink-0 text-[#CBD5E1]" />
          </button>
        );
      })}
    </div>
  );
}
