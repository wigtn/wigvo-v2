'use client';

import type { CommunicationMode } from '@/shared/call-types';
import { Card } from '@/components/ui/card';
import { Mic, MessageSquare, Captions, Bot } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface CallModeSelectorProps {
  selectedMode: CommunicationMode;
  onModeSelect: (mode: CommunicationMode) => void;
  className?: string;
}

interface ModeOption {
  mode: CommunicationMode;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  description: string;
}

const modeOptions: ModeOption[] = [
  {
    mode: 'voice_to_voice',
    icon: Mic,
    title: '양방향 음성 번역',
    subtitle: 'Voice Translation',
    description: '모국어로 말하면 실시간 번역됩니다',
  },
  {
    mode: 'text_to_voice',
    icon: MessageSquare,
    title: '텍스트 → 음성',
    subtitle: 'Text to Voice',
    description: '텍스트를 입력하면 AI가 대신 말합니다',
  },
  {
    mode: 'voice_to_text',
    icon: Captions,
    title: '음성 → 자막',
    subtitle: 'Voice to Text',
    description: '상대방 말이 자막으로 표시됩니다',
  },
  {
    mode: 'full_agent',
    icon: Bot,
    title: 'AI 자율 통화',
    subtitle: 'AI Agent',
    description: 'AI가 수집된 정보로 통화를 진행합니다',
  },
];

export default function CallModeSelector({
  selectedMode,
  onModeSelect,
  className,
}: CallModeSelectorProps) {
  return (
    <div className={className}>
      <p className="text-sm font-medium text-[#334155] mb-2">
        {'통화 방식을 선택하세요'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {modeOptions.map(({ mode, icon: Icon, title, subtitle, description }) => {
          const isSelected = selectedMode === mode;

          return (
            <Card
              key={mode}
              onClick={() => onModeSelect(mode)}
              className={`relative cursor-pointer p-3 py-3 gap-2 transition-all hover:shadow-md ${
                isSelected
                  ? 'ring-2 ring-[#0F172A] border-[#0F172A] bg-[#F8FAFC]'
                  : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
              }`}
            >
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    isSelected ? 'bg-[#0F172A] text-white' : 'bg-[#F1F5F9] text-[#64748B]'
                  }`}
                >
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#0F172A] leading-tight">{title}</p>
                  <p className="text-[10px] text-[#94A3B8] leading-tight">{subtitle}</p>
                </div>
              </div>
              <p className="text-[10px] text-[#64748B] leading-snug">{description}</p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
