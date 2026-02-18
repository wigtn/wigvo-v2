'use client';

import type { CallMode } from '@/shared/call-types';
import type { ScenarioType } from '@/shared/types';

interface CallModeSelectorProps {
  onSelect: (mode: CallMode) => void;
  scenarioType?: ScenarioType | null;
}

const modes: {
  mode: CallMode;
  icon: string;
  title: string;
  description: string;
  recommendedFor: ScenarioType[];
}[] = [
  {
    mode: 'agent',
    icon: '\u{1F916}',
    title: 'AI \uC790\uB3D9\uD1B5\uD654',
    description: 'AI\uAC00 \uC54C\uC544\uC11C \uC804\uD654\uD569\uB2C8\uB2E4',
    recommendedFor: ['RESERVATION', 'AS_REQUEST'],
  },
  {
    mode: 'relay',
    icon: '\u{1F399}\uFE0F',
    title: '\uC9C1\uC811 \uD1B5\uD654',
    description: '\uB0B4\uAC00 \uB9D0\uD558\uBA74 \uBC88\uC5ED\uD574\uC90D\uB2C8\uB2E4',
    recommendedFor: ['INQUIRY'],
  },
];

export default function CallModeSelector({ onSelect, scenarioType }: CallModeSelectorProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-[#334155]">
        {'\uD1B5\uD654 \uBC29\uC2DD\uC744 \uC120\uD0DD\uD558\uC138\uC694'}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {modes.map(({ mode, icon, title, description, recommendedFor }) => {
          const isRecommended = scenarioType ? recommendedFor.includes(scenarioType) : false;

          return (
            <button
              key={mode}
              onClick={() => onSelect(mode)}
              className={`relative flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all hover:shadow-md ${
                isRecommended
                  ? 'border-[#0F172A] bg-[#F8FAFC] shadow-sm'
                  : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
              }`}
            >
              {isRecommended && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-[#0F172A] px-2.5 py-0.5 text-[10px] font-semibold text-white">
                  {'\uCD94\uCC9C'}
                </span>
              )}
              <span className="text-3xl">{icon}</span>
              <span className="text-sm font-bold text-[#0F172A]">{title}</span>
              <span className="text-xs text-[#94A3B8] leading-tight">{description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
