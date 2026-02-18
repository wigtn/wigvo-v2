'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Loader2,
  AlertTriangle,
  RefreshCw,
  Phone,
  Calendar,
  HelpCircle,
  Search,
  Clock,
  CheckCircle,
  XCircle,
  PhoneCall,
  ArrowLeft,
  MapPin,
  Scissors,
  FileText,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Call } from '@/shared/types';

// ===========================================================================
// 헬퍼 함수들
// ===========================================================================
function formatRelativeDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  } else if (days === 1) {
    return '어제';
  } else if (days < 7) {
    return `${days}일 전`;
  }
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function formatFullDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatParsedDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month - 1, day);
      const days = ['일', '월', '화', '수', '목', '금', '토'];
      return `${year}년 ${month}월 ${day}일 (${days[d.getDay()]})`;
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}

function formatParsedTime(timeStr: string | null): string {
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

function getRequestTypeLabel(type: string): string {
  switch (type) {
    case 'RESERVATION': return '예약';
    case 'INQUIRY': return '문의';
    case 'AS_REQUEST': return 'AS 요청';
    default: return type;
  }
}

function getRequestTypeIcon(type: string) {
  switch (type) {
    case 'RESERVATION': return <Calendar className="size-4 text-[#64748B]" />;
    case 'INQUIRY': return <HelpCircle className="size-4 text-[#64748B]" />;
    default: return <Phone className="size-4 text-[#64748B]" />;
  }
}

function getListStatusIcon(status: string, result: string | null) {
  if (status === 'COMPLETED' && result === 'SUCCESS') {
    return <CheckCircle className="size-3.5 text-teal-500" />;
  }
  if (status === 'COMPLETED' || status === 'FAILED') {
    return <XCircle className="size-3.5 text-red-500" />;
  }
  if (status === 'CALLING' || status === 'IN_PROGRESS') {
    return <PhoneCall className="size-3.5 text-[#0F172A] animate-pulse" />;
  }
  return <Clock className="size-3.5 text-[#CBD5E1]" />;
}

function getStatusBadge(status: string, result: string | null) {
  if (status === 'COMPLETED' && result === 'SUCCESS') {
    return { label: '성공', bg: 'bg-teal-50', text: 'text-teal-600' };
  }
  if (status === 'COMPLETED' || status === 'FAILED') {
    return { label: '실패', bg: 'bg-red-50', text: 'text-red-600' };
  }
  if (status === 'CALLING' || status === 'IN_PROGRESS') {
    return { label: '통화중', bg: 'bg-amber-50', text: 'text-amber-600' };
  }
  return { label: '대기', bg: 'bg-[#F1F5F9]', text: 'text-[#64748B]' };
}

function getResultLabel(result: string | null): string {
  switch (result) {
    case 'SUCCESS': return '성공';
    case 'NO_ANSWER': return '전화를 받지 않음';
    case 'REJECTED': return '요청 거절됨';
    case 'ERROR': return '오류 발생';
    default: return '-';
  }
}

function getCallStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING': return '대기 중';
    case 'CALLING': return '전화 거는 중...';
    case 'IN_PROGRESS': return '통화 중...';
    case 'COMPLETED': return '통화 완료';
    case 'FAILED': return '통화 실패';
    default: return status;
  }
}

function getFailureMessage(result: string | null): string {
  switch (result) {
    case 'NO_ANSWER': return '상대방이 전화를 받지 않았습니다.';
    case 'REJECTED': return '요청이 거절되었습니다.';
    case 'ERROR': return '통화 중 오류가 발생했습니다.';
    default: return '알 수 없는 오류가 발생했습니다.';
  }
}

// ===========================================================================
// CallHistoryPanel (메인 컴포넌트)
// ===========================================================================
export default function CallHistoryPanel() {
  const router = useRouter();

  // ── 통화 목록 상태 ──
  const [calls, setCalls] = useState<Call[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const listFetchedRef = useRef(false);

  // ── 선택된 통화 상세 ──
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Call | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── 모바일 뷰 전환 ──
  const [mobileView, setMobileView] = useState<'list' | 'detail'>('list');

  // ────────────────────────────────────────────────────────────────
  // 통화 목록 fetch
  // ────────────────────────────────────────────────────────────────
  const fetchCalls = useCallback(async () => {
    setListLoading(true);
    setListError(null);

    try {
      const res = await fetch('/api/calls');

      if (res.status === 401) {
        router.push('/login');
        return;
      }

      if (!res.ok) {
        setListError('통화 기록을 불러오는 데 실패했습니다.');
        setListLoading(false);
        return;
      }

      const data = await res.json();
      setCalls(data.calls || []);
      setListLoading(false);
    } catch {
      setListError('네트워크 오류가 발생했습니다.');
      setListLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (listFetchedRef.current) return;
    listFetchedRef.current = true;
    fetchCalls();
  }, [fetchCalls]);

  // ────────────────────────────────────────────────────────────────
  // 통화 상세 fetch
  // ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let cancelled = false;

    async function fetchDetail() {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const res = await fetch(`/api/calls/${selectedId}`);

        if (!cancelled) {
          if (res.status === 401) {
            router.push('/login');
            return;
          }

          if (!res.ok) {
            setDetailError('통화 상세를 불러오는 데 실패했습니다.');
            setDetailLoading(false);
            return;
          }

          const data: Call = await res.json();
          setDetail(data);
          setDetailLoading(false);
        }
      } catch {
        if (!cancelled) {
          setDetailError('네트워크 오류가 발생했습니다.');
          setDetailLoading(false);
        }
      }
    }

    fetchDetail();

    return () => {
      cancelled = true;
    };
  }, [selectedId, router]);

  // ────────────────────────────────────────────────────────────────
  // 핸들러
  // ────────────────────────────────────────────────────────────────
  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMobileView('detail');
  };

  const handleBack = () => {
    setMobileView('list');
  };

  const handleRefresh = () => {
    listFetchedRef.current = false;
    fetchCalls();
  };

  // ────────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col lg:flex-row bg-[#F8FAFC]">
      {/* ───── 좌측: 통화 리스트 ───── */}
      <div
        className={cn(
          'lg:w-80 lg:border-r lg:border-[#E2E8F0] flex flex-col bg-white',
          mobileView === 'list' ? 'flex-1 lg:flex-none' : 'hidden lg:flex',
        )}
      >
        {/* 리스트 헤더 */}
        <div className="shrink-0 px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#F1F5F9] flex items-center justify-center">
                <Phone className="size-4 text-[#0F172A]" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[#0F172A] tracking-tight">통화 기록</h2>
                {!listLoading && !listError && (
                  <p className="text-[10px] text-[#94A3B8] mt-0.5">총 {calls.length}건</p>
                )}
              </div>
            </div>
            <button
              onClick={handleRefresh}
              disabled={listLoading}
              className="p-1.5 rounded-lg text-[#64748B] hover:text-[#334155] hover:bg-[#F1F5F9] transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn('size-3.5', listLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* 리스트 본문 */}
        <div className="flex-1 overflow-y-auto styled-scrollbar">
          {listLoading ? (
            <div className="px-4 py-6 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-16 bg-[#F1F5F9] rounded-xl" />
                </div>
              ))}
            </div>
          ) : listError ? (
            <div className="flex flex-col items-center gap-3 py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
                <AlertTriangle className="size-5 text-red-500" />
              </div>
              <p className="text-sm text-red-600 font-medium text-center">{listError}</p>
              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] transition-all"
              >
                <RefreshCw className="size-3" />
                다시 시도
              </button>
            </div>
          ) : calls.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 px-4">
              <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center">
                <Inbox className="size-5 text-[#CBD5E1]" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[#94A3B8]">통화 기록이 없습니다</p>
                <p className="text-xs text-[#CBD5E1] mt-1">채팅에서 전화를 요청해보세요</p>
              </div>
            </div>
          ) : (
            <div className="px-2 py-2 space-y-0.5">
              {calls.map((call) => {
                const badge = getStatusBadge(call.status, call.result);
                return (
                  <button
                    key={call.id}
                    onClick={() => handleSelect(call.id)}
                    className={cn(
                      'w-full text-left px-3 py-3 rounded-xl transition-all',
                      'hover:bg-[#F8FAFC]',
                      selectedId === call.id && 'bg-[#F1F5F9]',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      {getListStatusIcon(call.status, call.result)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[#0F172A] truncate">
                            {call.targetName || '알 수 없음'}
                          </p>
                          <span className="text-[10px] text-[#CBD5E1] shrink-0">
                            {formatRelativeDate(call.createdAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-[#94A3B8]">
                            {getRequestTypeLabel(call.requestType)}
                          </span>
                          <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-semibold', badge.bg, badge.text)}>
                            {badge.label}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ───── 우측: 통화 상세 ───── */}
      <div
        className={cn(
          'flex-1 flex flex-col bg-[#F8FAFC]',
          mobileView === 'detail' ? 'flex' : 'hidden lg:flex',
        )}
      >
        {selectedId === null ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
            <div className="w-14 h-14 rounded-2xl bg-[#F1F5F9] flex items-center justify-center">
              <Phone className="size-6 text-[#CBD5E1]" />
            </div>
            <p className="text-sm font-medium text-[#94A3B8]">통화를 선택해주세요</p>
            <p className="text-xs text-[#CBD5E1]">좌측 목록에서 통화를 선택하면 상세 내용을 확인할 수 있습니다</p>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <Loader2 className="size-6 text-[#0F172A] animate-spin" />
            <p className="text-sm text-[#94A3B8]">통화 정보를 불러오는 중...</p>
          </div>
        ) : detailError ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 px-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 flex items-center justify-center">
              <AlertTriangle className="size-5 text-red-500" />
            </div>
            <p className="text-sm font-medium text-red-600">{detailError}</p>
            <button
              onClick={() => setSelectedId(selectedId)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-[#E2E8F0] text-[#64748B] hover:bg-[#F8FAFC] transition-all"
            >
              <RefreshCw className="size-3" />
              다시 시도
            </button>
          </div>
        ) : detail ? (
          <CallDetailView call={detail} onBack={handleBack} />
        ) : null}
      </div>
    </div>
  );
}

// ===========================================================================
// CallDetailView (우측 상세 영역)
// ===========================================================================
function CallDetailView({ call, onBack }: { call: Call; onBack: () => void }) {
  const isSuccess = call.status === 'COMPLETED' && call.result === 'SUCCESS';
  const isFailed = call.status === 'FAILED' || (call.status === 'COMPLETED' && call.result !== 'SUCCESS');
  const isInProgress = call.status === 'CALLING' || call.status === 'IN_PROGRESS';

  const badge = getStatusBadge(call.status, call.result);

  return (
    <>
      {/* 상세 헤더 */}
      <div className="shrink-0 px-5 py-4 bg-white border-b border-[#E2E8F0]">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="lg:hidden p-1.5 -ml-1.5 rounded-lg hover:bg-[#F1F5F9] transition-colors"
          >
            <ArrowLeft className="size-4 text-[#64748B]" />
          </button>

          <div className="w-9 h-9 rounded-xl bg-[#F1F5F9] flex items-center justify-center shrink-0">
            {getRequestTypeIcon(call.requestType)}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[#0F172A] truncate">
                {call.targetName || '알 수 없는 대상'}
              </h2>
              <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold', badge.bg, badge.text)}>
                {badge.label}
              </span>
            </div>
            <p className="text-[11px] text-[#94A3B8] mt-0.5">
              {formatFullDate(call.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* 상세 본문 */}
      <div className="flex-1 overflow-y-auto styled-scrollbar">
        <div className="max-w-xl mx-auto px-5 py-6 space-y-5">

          {/* ── 결과 배너 ── */}
          <div
            className={cn(
              'flex items-center gap-4 rounded-2xl px-5 py-5 border',
              isSuccess && 'bg-teal-50/50 border-teal-100',
              isFailed && 'bg-red-50/50 border-red-100',
              isInProgress && 'bg-amber-50/50 border-amber-100',
              !isSuccess && !isFailed && !isInProgress && 'bg-[#F1F5F9] border-[#E2E8F0]',
            )}
          >
            <div
              className={cn(
                'w-12 h-12 rounded-2xl flex items-center justify-center shrink-0',
                isSuccess && 'bg-teal-100',
                isFailed && 'bg-red-100',
                isInProgress && 'bg-amber-100',
                !isSuccess && !isFailed && !isInProgress && 'bg-[#E2E8F0]',
              )}
            >
              {isSuccess && <CheckCircle className="size-6 text-teal-600" />}
              {isFailed && <XCircle className="size-6 text-red-500" />}
              {isInProgress && <PhoneCall className="size-6 text-amber-600 animate-pulse" />}
              {!isSuccess && !isFailed && !isInProgress && <Clock className="size-6 text-[#64748B]" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-[#0F172A] tracking-tight">
                {isSuccess ? '통화 성공' : isFailed ? '통화 실패' : isInProgress ? '통화 진행 중' : '통화 대기 중'}
              </p>
              <p className="text-sm text-[#64748B] mt-0.5">
                {isSuccess
                  ? getCallStatusLabel(call.status)
                  : isFailed
                    ? getFailureMessage(call.result)
                    : getCallStatusLabel(call.status)}
              </p>
            </div>
          </div>

          {/* ── 통화 정보 카드 ── */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
              <Phone className="size-3.5 text-[#64748B]" />
              <span className="text-xs font-semibold text-[#0F172A]">통화 정보</span>
              <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F1F5F9] text-[#64748B]">
                {getRequestTypeLabel(call.requestType)}
              </span>
            </div>

            <div className="px-5 py-4 space-y-4">
              <DetailRow
                icon={<MapPin className="size-4" />}
                label="대상"
                value={call.targetName || '-'}
              />
              <DetailRow
                icon={<Phone className="size-4" />}
                label="전화번호"
                value={call.targetPhone}
              />
              {call.parsedDate && (
                <DetailRow
                  icon={<Calendar className="size-4" />}
                  label="날짜"
                  value={formatParsedDate(call.parsedDate)}
                />
              )}
              {call.parsedTime && (
                <DetailRow
                  icon={<Clock className="size-4" />}
                  label="시간"
                  value={formatParsedTime(call.parsedTime)}
                />
              )}
              {call.parsedService && (
                <DetailRow
                  icon={<Scissors className="size-4" />}
                  label="서비스"
                  value={call.parsedService}
                />
              )}
            </div>
          </div>

          {/* ── 결과 상세 카드 ── */}
          {(call.status === 'COMPLETED' || call.status === 'FAILED') && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
                {isSuccess ? (
                  <CheckCircle className="size-3.5 text-teal-500" />
                ) : (
                  <XCircle className="size-3.5 text-red-500" />
                )}
                <span className="text-xs font-semibold text-[#0F172A]">결과 상세</span>
              </div>

              <div className="px-5 py-4 space-y-4">
                <DetailRow
                  icon={<PhoneCall className="size-4" />}
                  label="통화 상태"
                  value={getCallStatusLabel(call.status)}
                />
                <DetailRow
                  icon={isSuccess ? <CheckCircle className="size-4" /> : <XCircle className="size-4" />}
                  label="결과"
                  value={getResultLabel(call.result)}
                />
                {call.completedAt && (
                  <DetailRow
                    icon={<Clock className="size-4" />}
                    label="완료 시간"
                    value={formatFullDate(call.completedAt)}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── AI 통화 요약 ── */}
          {call.summary && (
            <div className="bg-white border border-[#E2E8F0] rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
              <div className="px-5 py-3 border-b border-[#E2E8F0] flex items-center gap-2">
                <FileText className="size-3.5 text-[#94A3B8]" />
                <span className="text-xs font-semibold text-[#0F172A]">AI 통화 요약</span>
              </div>
              <div className="px-5 py-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#334155] pl-3 border-l-2 border-[#E2E8F0] italic">
                  {call.summary}
                </p>
              </div>
            </div>
          )}

          {/* ── 타임스탬프 ── */}
          <div className="text-center pt-2 pb-4">
            <p className="text-[10px] text-[#CBD5E1]">
              생성: {formatFullDate(call.createdAt)}
              {call.completedAt && ` · 완료: ${formatFullDate(call.completedAt)}`}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ===========================================================================
// DetailRow (상세 필드 행)
// ===========================================================================
function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] flex items-center justify-center shrink-0 text-[#64748B]">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-[#0F172A] mt-0.5">{value}</p>
      </div>
    </div>
  );
}
