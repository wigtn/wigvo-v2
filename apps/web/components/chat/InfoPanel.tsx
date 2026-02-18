'use client';

import type { CollectedData, ConversationStatus } from '@/shared/types';
import { MapPin, Phone, Calendar, Scissors, User, Users, FileText, Clock, ExternalLink } from 'lucide-react';

interface InfoPanelProps {
  status: ConversationStatus;
  collectedData: CollectedData | null;
  isComplete: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  isLoading: boolean;
}

const STATUS_CONFIG: Record<ConversationStatus, { label: string; color: string; bg: string }> = {
  COLLECTING: { label: '정보 수집 중', color: 'text-amber-600', bg: 'bg-amber-50' },
  READY: { label: '전화 준비 완료', color: 'text-teal-600', bg: 'bg-teal-50' },
  CALLING: { label: '통화 중', color: 'text-violet-600', bg: 'bg-violet-50' },
  COMPLETED: { label: '완료', color: 'text-[#64748B]', bg: 'bg-[#F1F5F9]' },
  CANCELLED: { label: '취소됨', color: 'text-[#94A3B8]', bg: 'bg-[#F8FAFC]' },
};

export default function InfoPanel({
  status,
  collectedData,
  isComplete,
  onConfirm,
  onEdit,
  isLoading,
}: InfoPanelProps) {
  const statusCfg = STATUS_CONFIG[status] || STATUS_CONFIG.COLLECTING;
  const hasTarget = collectedData?.target_name;

  return (
    <div className="flex flex-col h-full">
      {/* ── 상단: 지도 영역 ── */}
      <div className="flex-1 min-h-0 relative bg-[#F1F5F9] border-b border-[#E2E8F0]">
        {hasTarget ? (
          <div className="absolute inset-0 flex flex-col">
            {/* 지도 배경 — 실제 서비스에서는 카카오맵/네이버맵 연동 */}
            <div className="flex-1 relative overflow-hidden">
              {/* 그리드 패턴 배경 */}
              <div
                className="absolute inset-0 opacity-[0.03]"
                style={{
                  backgroundImage: `
                    linear-gradient(#64748B 1px, transparent 1px),
                    linear-gradient(90deg, #64748B 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px',
                }}
              />

              {/* 중앙 핀 */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-200">
                    <MapPin className="size-5 text-white" />
                  </div>
                  <div className="w-2 h-2 bg-violet-600 rotate-45 -mt-1" />
                  <div className="mt-3 px-3 py-1.5 rounded-lg bg-white border border-[#E2E8F0] shadow-sm">
                    <p className="text-xs font-medium text-[#0F172A]">{collectedData?.target_name}</p>
                    {collectedData?.target_phone && (
                      <p className="text-[10px] text-[#94A3B8] mt-0.5">{collectedData.target_phone}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 도로 표시 */}
              <div className="absolute top-1/2 left-0 right-0 h-px bg-[#CBD5E1]/30" />
              <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#CBD5E1]/30" />
              <div className="absolute top-[30%] left-0 right-0 h-px bg-[#CBD5E1]/20" />
              <div className="absolute top-0 bottom-0 left-[30%] w-px bg-[#CBD5E1]/20" />
              <div className="absolute top-[70%] left-0 right-0 h-px bg-[#CBD5E1]/20" />
              <div className="absolute top-0 bottom-0 left-[70%] w-px bg-[#CBD5E1]/20" />
            </div>

            {/* 지도 하단 오버레이 */}
            <div className="absolute bottom-0 left-0 right-0 px-3 py-2 bg-linear-to-t from-[#F1F5F9] to-transparent">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[#94A3B8]">지도 미리보기</span>
                <button className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-700 transition-colors">
                  <ExternalLink className="size-2.5" />
                  지도에서 열기
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* 빈 상태 */
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-xl bg-white border border-[#E2E8F0] flex items-center justify-center mb-3 shadow-sm">
              <MapPin className="size-5 text-[#CBD5E1]" />
            </div>
            <p className="text-xs text-[#94A3B8] text-center">
              업체 정보를 입력하면
              <br />
              위치가 표시됩니다
            </p>
          </div>
        )}
      </div>

      {/* ── 하단: 업체 정보 ── */}
      <div className="shrink-0 bg-white overflow-y-auto styled-scrollbar" style={{ height: '45%' }}>
        {/* 상태 배지 */}
        <div className="px-4 pt-4 pb-3 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-[#0F172A] uppercase tracking-wider">업체 정보</h3>
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${statusCfg.bg} ${statusCfg.color}`}>
              {statusCfg.label}
            </span>
          </div>
        </div>

        {/* 정보 리스트 */}
        <div className="px-4 py-3 space-y-3">
          <InfoRow
            icon={<FileText className="size-3.5" />}
            label="용건 유형"
            value={formatScenario(collectedData?.scenario_type)}
          />
          <InfoRow
            icon={<MapPin className="size-3.5" />}
            label="업체명"
            value={collectedData?.target_name}
            highlight
          />
          <InfoRow
            icon={<Phone className="size-3.5" />}
            label="전화번호"
            value={collectedData?.target_phone}
          />
          <InfoRow
            icon={<Calendar className="size-3.5" />}
            label="날짜/시간"
            value={collectedData?.primary_datetime}
          />
          <InfoRow
            icon={<Scissors className="size-3.5" />}
            label="서비스"
            value={collectedData?.service}
          />
          {collectedData?.customer_name && (
            <InfoRow
              icon={<User className="size-3.5" />}
              label="예약자"
              value={collectedData.customer_name}
            />
          )}
          {collectedData?.party_size && (
            <InfoRow
              icon={<Users className="size-3.5" />}
              label="인원"
              value={`${collectedData.party_size}명`}
            />
          )}
          {collectedData?.special_request && (
            <InfoRow
              icon={<Clock className="size-3.5" />}
              label="요청사항"
              value={collectedData.special_request}
            />
          )}
        </div>

        {/* 액션 버튼 — 수집 완료 시 */}
        {isComplete && (
          <div className="px-4 pb-4 pt-1 flex gap-2">
            <button
              onClick={onEdit}
              disabled={isLoading}
              className="flex-1 h-9 rounded-lg text-xs font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9] transition-all disabled:opacity-40"
            >
              수정
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className="flex-1 h-9 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition-all disabled:opacity-40 shadow-sm flex items-center justify-center gap-1.5"
            >
              <Phone className="size-3" />
              {isLoading ? '처리 중...' : '전화 걸기'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 서브 컴포넌트 ── */

function InfoRow({
  icon,
  label,
  value,
  highlight = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
  highlight?: boolean;
}) {
  const filled = !!value;
  return (
    <div className="flex items-start gap-2.5">
      <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${filled ? 'bg-violet-50 text-violet-600' : 'bg-[#F1F5F9] text-[#CBD5E1]'}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-[#94A3B8] uppercase tracking-wider">{label}</p>
        <p className={`text-sm truncate ${filled ? (highlight ? 'font-semibold text-[#0F172A]' : 'text-[#334155]') : 'text-[#CBD5E1] italic'}`}>
          {value || '미입력'}
        </p>
      </div>
      {filled && (
        <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-2.5" />
      )}
    </div>
  );
}

function formatScenario(type: string | null | undefined): string | null {
  if (!type) return null;
  switch (type) {
    case 'RESERVATION': return '예약';
    case 'INQUIRY': return '문의';
    case 'AS_REQUEST': return 'AS/수리';
    default: return type;
  }
}
