'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import type { CaptionEntry } from '@/shared/call-types';

interface LiveCaptionPanelProps {
  captions: CaptionEntry[];
  translationState: 'idle' | 'processing' | 'done';
  expanded?: boolean;
  compact?: boolean;
}

export default function LiveCaptionPanel({
  captions,
  translationState,
  expanded = false,
  compact = false,
}: LiveCaptionPanelProps) {
  const t = useTranslations('call');
  const scrollRef = useRef<HTMLDivElement>(null);

  // In compact mode, show only the last 3 captions
  const displayCaptions = compact ? captions.slice(-3) : captions;

  // Auto-scroll to bottom on new captions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {!compact && (
        <div className={`px-4 border-b border-[#E2E8F0] ${expanded ? 'py-3' : 'py-2'}`}>
          <h3 className={`font-semibold text-[#64748B] uppercase tracking-wider ${expanded ? 'text-sm' : 'text-xs'}`}>
            {t('captions')}
            {expanded && (
              <span className="ml-2 text-[10px] font-normal normal-case text-[#94A3B8]">
                {t('captionOnlyMode')}
              </span>
            )}
          </h3>
        </div>
      )}

      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto styled-scrollbar space-y-2 ${
          compact ? 'px-4 py-2' : expanded ? 'px-5 py-4' : 'px-4 py-3'
        }`}
      >
        {displayCaptions.length === 0 && (
          <p className={`text-center text-[#CBD5E1] ${expanded ? 'text-sm py-12' : compact ? 'text-xs py-4' : 'text-xs py-8'}`}>
            {t('captionEmpty')}
          </p>
        )}

        {displayCaptions.map((entry) => {
          const isUser = entry.speaker === 'user';
          const isStage1 = entry.stage === 1;
          const hasMergedOriginal = !!entry.originalText;

          return (
            <div
              key={entry.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl ${expanded ? 'px-4 py-3' : 'px-3 py-2'} ${
                  isUser
                    ? 'bg-[#0F172A] text-white'
                    : isStage1
                      ? 'bg-[#F1F5F9] text-[#94A3B8]'
                      : expanded
                        ? 'bg-[#F1F5F9] text-[#1E293B]'
                        : 'bg-[#F1F5F9] text-[#334155]'
                }`}
              >
                <p className={`font-medium mb-0.5 opacity-70 ${expanded ? 'text-xs' : 'text-[10px]'}`}>
                  {entry.speaker === 'user'
                    ? t('caption.you')
                    : entry.speaker === 'ai'
                      ? t('caption.ai')
                      : t('caption.recipient')}
                  {isStage1 && ` (${t('caption.original')})`}
                </p>
                {/* 원문 + 번역이 합쳐진 경우: 원문을 작게, 번역을 크게 표시 */}
                {hasMergedOriginal && (
                  <p className={`leading-relaxed text-[#94A3B8] mb-1 ${expanded ? 'text-sm' : 'text-xs'}`}>
                    {entry.originalText}
                  </p>
                )}
                <p
                  className={`leading-relaxed ${
                    expanded
                      ? isStage1 ? 'text-base' : 'text-2xl font-medium'
                      : isStage1 ? 'text-xs' : 'text-sm'
                  }`}
                >
                  {entry.text}
                </p>
              </div>
            </div>
          );
        })}

        {translationState === 'processing' && (
          <div className="flex justify-start">
            <div className={`rounded-xl bg-[#F1F5F9] ${expanded ? 'px-4 py-3' : 'px-3 py-2'}`}>
              <p className={`text-[#94A3B8] animate-pulse ${expanded ? 'text-sm' : 'text-xs'}`}>
                {t('translating')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
