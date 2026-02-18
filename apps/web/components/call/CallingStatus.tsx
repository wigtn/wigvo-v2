'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { type Call } from '@/shared/types';
import { Check, X } from 'lucide-react';

const Orb = dynamic(() => import('@/components/ui/Orb'), { ssr: false });

interface CallingStatusProps {
  call: Call | null;
  elapsed: number;
}

function formatElapsed(seconds: number): string {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

export default function CallingStatus({ call, elapsed }: CallingStatusProps) {
  const t = useTranslations('callStatus');
  const isTerminal = call?.status === 'COMPLETED' || call?.status === 'FAILED';
  const isFailed = call?.status === 'FAILED';

  const statusLabel = (() => {
    switch (call?.status) {
      case 'PENDING': case 'CALLING': return t('connecting');
      case 'IN_PROGRESS': return t('delivering');
      case 'COMPLETED': return t('completed');
      case 'FAILED': return t('failed');
      default: return t('preparing');
    }
  })();

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6 px-6">
      {/* Orb 영역 */}
      {!isTerminal ? (
        <div className="w-72 h-72">
          <Orb
            hue={160}
            hoverIntensity={0.5}
            rotateOnHover={true}
            forceHoverState={true}
            backgroundColor="transparent"
          />
        </div>
      ) : (
        <div
          className={`flex h-20 w-20 items-center justify-center rounded-full border-2 ${
            isFailed
              ? 'border-red-200 bg-red-50'
              : 'border-teal-200 bg-teal-50'
          }`}
        >
          {isFailed ? (
            <X className="size-7 text-red-500" />
          ) : (
            <Check className="size-7 text-teal-600" />
          )}
        </div>
      )}

      {/* 상태 텍스트 */}
      <div className="text-center">
        <p className={`text-sm font-medium mb-1 ${
          isFailed ? 'text-red-500' : 'text-[#64748B]'
        }`}>
          {statusLabel}
          {!isTerminal && (
            <span className="ml-1.5 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500 align-middle" />
          )}
        </p>
        {call?.targetName && (
          <h2 className="text-lg font-bold text-[#0F172A] tracking-tight">
            {call.targetName}
          </h2>
        )}
        {call?.targetPhone && (
          <p className="mt-0.5 font-mono text-xs text-[#94A3B8]">{call.targetPhone}</p>
        )}
      </div>

      {/* 경과 시간 */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[#94A3B8] font-semibold">
          {t('elapsed')}
        </span>
        <span className="font-mono text-3xl font-bold tabular-nums tracking-tight text-[#0F172A]">
          {formatElapsed(elapsed)}
        </span>
      </div>

      {/* 간단한 단계 표시 */}
      {!isTerminal && (
        <div className="flex items-center gap-2">
          {[t('stepConnect'), t('stepDeliver'), t('stepComplete')].map((label, i) => {
            const stepIndex = (() => {
              const s = call?.status || 'PENDING';
              if (s === 'PENDING' || s === 'CALLING') return 0;
              if (s === 'IN_PROGRESS') return 1;
              return 2;
            })();
            const isActive = i === stepIndex;
            const isDone = i < stepIndex;

            return (
              <div key={label} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-6 h-px ${isDone ? 'bg-teal-300' : 'bg-[#E2E8F0]'}`} />
                )}
                <div className="flex items-center gap-1.5">
                  <div
                    className={`w-2 h-2 rounded-full transition-colors ${
                      isActive
                        ? 'bg-[#0F172A] animate-pulse'
                        : isDone
                          ? 'bg-teal-500'
                          : 'bg-[#E2E8F0]'
                    }`}
                  />
                  <span className={`text-xs ${
                    isActive
                      ? 'font-medium text-[#0F172A]'
                      : isDone
                        ? 'text-teal-600'
                        : 'text-[#CBD5E1]'
                  }`}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
