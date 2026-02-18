'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CollectedData } from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import CallModeSelector from '@/components/call/CallModeSelector';
import { Phone, Pencil, Plus, MapPin, Calendar, Scissors, User, Users, FileText } from 'lucide-react';

interface CollectionSummaryProps {
  data: CollectedData;
  onConfirm: (communicationMode: CommunicationMode) => void;
  onEdit: () => void;
  onNewConversation: () => void;
  isLoading?: boolean;
}

export default function CollectionSummary({
  data,
  onConfirm,
  onEdit,
  onNewConversation,
  isLoading = false,
}: CollectionSummaryProps) {
  const t = useTranslations('collection');
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('voice_to_voice');

  return (
    <div className="mx-4 mb-2 rounded-xl surface-card shadow-sm p-4 space-y-3">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
        <span className="text-[10px] text-teal-600 font-medium uppercase tracking-wider">
          {t('collectionComplete')}
        </span>
      </div>

      {/* 수집된 정보 */}
      <div className="space-y-2 text-sm">
        {data.target_name && (
          <div className="flex items-center gap-2.5">
            <MapPin className="size-3.5 text-[#94A3B8] shrink-0" />
            <span className="text-[#334155]">
              {data.target_name}
              {data.target_phone && (
                <span className="text-[#94A3B8] ml-1.5">{data.target_phone}</span>
              )}
            </span>
          </div>
        )}
        {data.primary_datetime && (
          <div className="flex items-center gap-2.5">
            <Calendar className="size-3.5 text-[#94A3B8] shrink-0" />
            <span className="text-[#334155]">{data.primary_datetime}</span>
          </div>
        )}
        {data.service && (
          <div className="flex items-center gap-2.5">
            <Scissors className="size-3.5 text-[#94A3B8] shrink-0" />
            <span className="text-[#334155]">{data.service}</span>
          </div>
        )}
        {data.customer_name && (
          <div className="flex items-center gap-2.5">
            <User className="size-3.5 text-[#94A3B8] shrink-0" />
            <span className="text-[#334155]">{t('reservedBy')} {data.customer_name}</span>
          </div>
        )}
        {data.party_size && (
          <div className="flex items-center gap-2.5">
            <Users className="size-3.5 text-[#94A3B8] shrink-0" />
            <span className="text-[#334155]">{t('partySize', { count: data.party_size })}</span>
          </div>
        )}
        {data.special_request && (
          <div className="flex items-center gap-2.5">
            <FileText className="size-3.5 text-[#94A3B8] shrink-0" />
            <span className="text-[#334155]">{data.special_request}</span>
          </div>
        )}
      </div>

      {/* 통화 모드 선택 */}
      <CallModeSelector
        selectedMode={communicationMode}
        onModeSelect={setCommunicationMode}
      />

      {/* 버튼 그룹 */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onEdit}
          disabled={isLoading}
          className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium bg-[#F8FAFC] border border-[#E2E8F0] text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#334155] transition-all disabled:opacity-40"
        >
          <Pencil className="size-3.5" />
          {t('edit')}
        </button>
        <button
          onClick={() => onConfirm(communicationMode)}
          disabled={isLoading}
          className="flex-1 h-10 rounded-xl flex items-center justify-center gap-1.5 text-sm font-medium bg-[#0F172A] text-white hover:bg-[#1E293B] transition-all disabled:opacity-40 shadow-sm"
        >
          <Phone className="size-3.5" />
          {isLoading ? t('processing') : t('makeCall')}
        </button>
      </div>

      {/* 새로운 요청 */}
      <button
        type="button"
        className="w-full text-center text-xs text-[#94A3B8] hover:text-[#64748B] flex items-center justify-center gap-1 pt-0.5 transition-colors"
        onClick={onNewConversation}
        disabled={isLoading}
      >
        <Plus className="size-3" />
        {t('newRequest')}
      </button>
    </div>
  );
}
