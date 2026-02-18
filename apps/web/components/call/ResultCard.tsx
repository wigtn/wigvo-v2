'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { type Call } from '@/shared/types';
import { useDashboard } from '@/hooks/useDashboard';
import { CheckCircle, XCircle, MapPin, Calendar, Clock, Scissors, FileText, RefreshCw, List, Home } from 'lucide-react';

interface ResultCardProps {
  call: Call;
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
  const t = useTranslations('result');
  const tc = useTranslations('common');
  const { resetCalling, callingCallId } = useDashboard();
  const isInline = !!callingCallId; // 대시보드 인라인 모드 여부
  const isSuccess = call.result === 'SUCCESS';

  const getFailureMessage = (result: string | null): string => {
    switch (result) {
      case 'NO_ANSWER': return t('failureNoAnswer');
      case 'REJECTED': return t('failureRejected');
      case 'ERROR': return t('failureError');
      default: return t('failureUnknown');
    }
  };

  const getFailureHint = (result: string | null): string => {
    switch (result) {
      case 'NO_ANSWER': return t('hintNoAnswer');
      case 'REJECTED': return t('hintRejected');
      case 'ERROR': return t('hintError');
      default: return t('hintDefault');
    }
  };

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
          {isSuccess ? t('reservationCompleted') : t('callFailed')}
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
            <h3 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">{t('reservationInfo')}</h3>
          </div>
          <div className="px-5 py-4 space-y-4">
            <InfoRow icon={<MapPin className="size-4" />} label={t('place')} value={call.targetName ?? '-'} />
            {call.parsedDate && (
              <InfoRow icon={<Calendar className="size-4" />} label={t('date')} value={formatDate(call.parsedDate)} />
            )}
            {call.parsedTime && (
              <InfoRow icon={<Clock className="size-4" />} label={t('time')} value={formatTime(call.parsedTime)} />
            )}
            {call.parsedService && (
              <InfoRow icon={<Scissors className="size-4" />} label={t('service')} value={call.parsedService} />
            )}
          </div>
        </div>
      )}

      {/* AI 요약 */}
      {call.summary && (
        <div className="w-full rounded-2xl bg-white border border-[#E2E8F0] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#E2E8F0] flex items-center gap-2">
            <FileText className="size-3.5 text-[#94A3B8]" />
            <h3 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">{t('aiSummary')}</h3>
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
            {t('retryCall')}
          </button>
        )}
        <button
          onClick={() => router.push('/history')}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium bg-white border border-[#E2E8F0] text-[#334155] hover:bg-[#F8FAFC] transition-all"
        >
          <List className="size-4" />
          {t('viewHistory')}
        </button>
        <button
          onClick={() => {
            if (isInline) { resetCalling(); } else { router.push('/'); }
          }}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-2 text-sm font-medium text-[#94A3B8] hover:text-[#64748B] hover:bg-[#F8FAFC] transition-all"
        >
          <Home className="size-4" />
          {isInline ? tc('newChat') : tc('home')}
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
