'use client';

import type { CaptionEntry } from '@/shared/call-types';
import { cn } from '@/lib/utils';

interface CaptionMessageProps {
  entry: CaptionEntry;
}

export default function CaptionMessage({ entry }: CaptionMessageProps) {
  const isUser = entry.speaker === 'user';
  const isStage1 = entry.stage === 1;

  const speakerLabel =
    entry.speaker === 'user'
      ? 'You'
      : entry.speaker === 'ai'
        ? 'AI'
        : 'Recipient';

  return (
    <div className={cn('flex w-full mb-3', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'bg-[#0F172A] text-white rounded-br-md'
            : isStage1
              ? 'bg-[#F1F5F9] text-[#94A3B8] rounded-bl-md'
              : 'surface-card shadow-sm text-[#334155] rounded-bl-md',
          !entry.isFinal && 'opacity-60',
        )}
      >
        <div className="text-[10px] font-medium mb-1 uppercase tracking-wider opacity-70">
          {speakerLabel}
          {isStage1 && ' (Original)'}
        </div>
        <p className={cn(isStage1 ? 'text-xs' : 'text-sm')}>
          {entry.text}
        </p>
      </div>
    </div>
  );
}
