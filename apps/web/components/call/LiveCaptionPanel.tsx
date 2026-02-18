'use client';

import { useEffect, useRef } from 'react';
import type { CaptionEntry } from '@/shared/call-types';

interface LiveCaptionPanelProps {
  captions: CaptionEntry[];
  translationState: 'idle' | 'processing' | 'done';
}

export default function LiveCaptionPanel({ captions, translationState }: LiveCaptionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new captions
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [captions.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-4 py-2 border-b border-[#E2E8F0]">
        <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">
          {'\uC790\uB9C9'}
        </h3>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto styled-scrollbar px-4 py-3 space-y-2">
        {captions.length === 0 && (
          <p className="text-center text-xs text-[#CBD5E1] py-8">
            {'\uD1B5\uD654\uAC00 \uC2DC\uC791\uB418\uBA74 \uC790\uB9C9\uC774 \uD45C\uC2DC\uB429\uB2C8\uB2E4'}
          </p>
        )}

        {captions.map((entry) => {
          const isUser = entry.speaker === 'user';
          const isStage1 = entry.stage === 1;

          return (
            <div
              key={entry.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 ${
                  isUser
                    ? 'bg-[#0F172A] text-white'
                    : isStage1
                      ? 'bg-[#F1F5F9] text-[#94A3B8]'
                      : 'bg-[#F1F5F9] text-[#334155]'
                }`}
              >
                <p className="text-[10px] font-medium mb-0.5 opacity-70">
                  {entry.speaker === 'user'
                    ? 'You'
                    : entry.speaker === 'ai'
                      ? 'AI'
                      : '\uC218\uC2E0\uC790'}
                  {isStage1 && ' (\uC6D0\uBB38)'}
                </p>
                <p className={`leading-relaxed ${isStage1 ? 'text-xs' : 'text-sm'}`}>
                  {entry.text}
                </p>
              </div>
            </div>
          );
        })}

        {translationState === 'processing' && (
          <div className="flex justify-start">
            <div className="rounded-xl bg-[#F1F5F9] px-3 py-2">
              <p className="text-xs text-[#94A3B8] animate-pulse">
                {'Translating...'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
