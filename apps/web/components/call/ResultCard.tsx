'use client';

import { useRouter } from 'next/navigation';
import { type Call } from '@/shared/types';
import { useDashboard } from '@/hooks/useDashboard';
import { CheckCircle, XCircle, MapPin, Calendar, Clock, Scissors, FileText, RefreshCw, List, Home } from 'lucide-react';

interface ResultCardProps {
  call: Call;
}

function getFailureMessage(result: string | null): string {
  switch (result) {
    case 'NO_ANSWER': return '상대방이 전화를 받지 않았습니다.';
    case 'REJECTED': return '요청이 거절되었습니다.';
    case 'ERROR': return '통화 중 오류가 발생했습니다.';
    default: return '알 수 없는 오류가 발생했습니다.';
  }
}

function getFailureHint(result: string | null): string {
  switch (result) {
    case 'NO_ANSWER': return '잠시 후 다시 시도해보세요.';
    case 'REJECTED': return '다른 일정이나 조건으로 다시 시도해보세요.';
    case 'ERROR': return '네트워크 상태를 확인하고 다시 시도해보세요.';
    default: return '다시 시도해보세요.';
  }
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const date = new Date(year, month - 1, day);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${year}년 ${month}월 ${day}일 (${days[date.getDay()]})`;
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${days[date.getDay()]})`;
  } catch {
    return dateStr;
  }
}

function formatTime(timeStr: string | null): string {
  if (!timeStr) return '-';
  try {
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    if (isNaN(hours) || isNaN(minutes)) return timeStr;
    const period = hours < 12 ? '오전' : '오후';
    const displayHours = hours % 12 || 12;
    return minutes > 0 ? `${period} ${displayHours}시 ${minutes}분` : `${period} ${displayHours}시`;
  } catch {
    return timeStr;
  }
}

export default function ResultCard({ call }: ResultCardProps) {
  const router = useRouter();
  const { resetCalling, callingCallId } = useDashboard();
  const isInline = !!callingCallId; // 대시보드 인라인 모드 여부
  const isSuccess = call.result === 'SUCCESS';

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      {/* 결과 헤더 */}
      <div
        className={`flex w-full flex-col items-center gap-4 rounded-2xl px-6 py-8 border ${
          isSuccess
            ? 'bg-teal-50/50 border-teal-100'
            : 'bg-red-50/50 border-red-100'
        }`}
      >
        <div
          className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
            isSuccess ? 'bg-teal-100' : 'bg-red-100'
          }`}
        >
          {isSuccess ? (
            <CheckCircle className="size-7 text-teal-600" />
          ) : (
            <XCircle className="size-7 text-red-500" />
          )}
        </div>
        <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
          {isSuccess ? '예약이 완료되었습니다' : '통화에 실패했습니다'}
        </h1>
        {!isSuccess && (
          <div className="text-center">
            <p className="text-sm font-medium text-red-600">{getFailureMessage(call.result)}</p>
            <p className="mt-1 text-xs text-[#94A3B8]">{getFailureHint(call.result)}</p>
          </div>
        )}
      </div>

      {/* 예약 정보 카드 */}
      {isSuccess && (
        <div className="w-full rounded-2xl bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0]">
            <h3 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">예약 정보</h3>
          </div>
          <div className="px-5 py-4 space-y-4">
            <InfoRow icon={<MapPin className="size-4" />} label="장소" value={call.targetName ?? '-'} />
            {call.parsedDate && (
              <InfoRow icon={<Calendar className="size-4" />} label="날짜" value={formatDate(call.parsedDate)} />
            )}
            {call.parsedTime && (
              <InfoRow icon={<Clock className="size-4" />} label="시간" value={formatTime(call.parsedTime)} />
            )}
            {call.parsedService && (
              <InfoRow icon={<Scissors className="size-4" />} label="서비스" value={call.parsedService} />
            )}
          </div>
        </div>
      )}

      {/* AI 요약 */}
      {call.summary && (
        <div className="w-full rounded-2xl bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center gap-2">
            <FileText className="size-3.5 text-[#94A3B8]" />
            <h3 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">AI 통화 요약</h3>
          </div>
          <div className="px-5 py-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#334155]">
              {call.summary}
            </p>
          </div>
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex w-full flex-col gap-2 pt-2">
        {!isSuccess && (
          <button
            onClick={() => {
              if (isInline) { resetCalling(); } else { router.push('/'); }
            }}
            className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium bg-[#0F172A] text-white hover:bg-[#1E293B] transition-all shadow-sm"
          >
            <RefreshCw className="size-4" />
            다시 시도하기
          </button>
        )}
        <button
          onClick={() => router.push('/history')}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium bg-white border border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC] transition-all"
        >
          <List className="size-4" />
          기록 보기
        </button>
        <button
          onClick={() => {
            if (isInline) { resetCalling(); } else { router.push('/'); }
          }}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F8FAFC] transition-all"
        >
          <Home className="size-4" />
          {isInline ? '새 대화' : '홈으로'}
        </button>
      </div>
    </div>
  );
}

/* ── 서브 컴포넌트 ── */
function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] flex items-center justify-center shrink-0 text-[#64748B]">
        {icon}
      </div>
      <div>
        <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-[#0F172A]">{value}</p>
      </div>
    </div>
  );
}
