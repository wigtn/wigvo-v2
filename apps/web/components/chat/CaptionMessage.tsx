'use client';

import { useTranslations } from 'next-intl';
import type { CaptionEntry } from '@/shared/call-types';
import { cn } from '@/lib/utils';

interface CaptionMessageProps {
  entry: CaptionEntry;
}

export default function CaptionMessage({ entry }: CaptionMessageProps) {
  const t = useTranslations('call.caption');
  const isUser = entry.speaker === 'user';
  const isAi = entry.speaker === 'ai';
  const isStage1 = entry.stage === 1;
  const isStage2 = entry.stage === 2;

  const speakerLabel =
    isUser ? t('you')
    : isAi ? t('ai')
    : t('recipient');

  const stageLabel =
    isStage1 ? t('original')
    : isStage2 ? t('translated')
    : null;

  return (
    <div className={cn('flex w-full mb-3', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-[#0F172A] text-white rounded-br-md'
            : isStage1
              ? 'bg-[#F1F5F9] text-[#94A3B8] rounded-bl-md border border-[#E2E8F0]'
              : isAi
                ? 'bg-teal-50 text-[#334155] rounded-bl-md border border-teal-100'
                : 'bg-white text-[#334155] rounded-bl-md border border-[#E2E8F0] shadow-sm',
          !entry.isFinal && 'opacity-60',
        )}
      >
        <div className={cn(
          'text-[10px] font-medium mb-1 uppercase tracking-wider',
          isUser ? 'text-white/60' : 'text-[#94A3B8]',
        )}>
          {speakerLabel}
          {stageLabel && ` · ${stageLabel}`}
        </div>
        <p className={cn(isStage1 ? 'text-xs' : 'text-sm')}>
          {entry.text}
        </p>
      </div>
    </div>
  );
}
