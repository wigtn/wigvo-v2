'use client';

import { useState } from 'react';
import { ChevronLeft, CalendarCheck, Search, Wrench, ArrowRight, Phone } from 'lucide-react';
import type { ScenarioType, ScenarioSubType } from '@/shared/types';
import { SCENARIO_CONFIG } from '@/lib/scenarios/config';

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  calendar: <CalendarCheck className="size-5 text-[#0F172A]" />,
  search: <Search className="size-5 text-[#0F172A]" />,
  wrench: <Wrench className="size-5 text-[#0F172A]" />,
};

interface ScenarioSelectorProps {
  onSelect: (scenarioType: ScenarioType, subType: ScenarioSubType) => void;
  disabled?: boolean;
}

export function ScenarioSelector({ onSelect, disabled = false }: ScenarioSelectorProps) {
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);

  const handleScenarioClick = (scenarioType: ScenarioType) => {
    setSelectedScenario(scenarioType);
  };

  const handleSubTypeClick = (subType: ScenarioSubType) => {
    if (selectedScenario) {
      onSelect(selectedScenario, subType);
    }
  };

  const handleBack = () => {
    setSelectedScenario(null);
  };

  // 메인 시나리오 선택 화면
  if (!selectedScenario) {
    return (
      <div className="flex flex-col h-full">
        {/* 콘텐츠 - 중앙 정렬 */}
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-5 glow-accent">
              <Phone className="size-5 text-[#0F172A]" />
            </div>
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1.5">
              어떤 용건으로 <span className="text-gradient">전화</span>할까요?
            </h2>
            <p className="text-sm text-[#94A3B8]">
              AI가 대신 전화를 걸어드립니다
            </p>
          </div>

          <div className="flex flex-col gap-2.5 max-w-sm mx-auto w-full">
            {(Object.entries(SCENARIO_CONFIG) as [ScenarioType, typeof SCENARIO_CONFIG[ScenarioType]][]).map(
              ([type, config]) => (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleScenarioClick(type)}
                  className="group relative flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] flex items-center justify-center shrink-0">
                    {SCENARIO_ICONS[config.icon] ?? <Phone className="size-5 text-[#0F172A]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[14px] font-semibold text-[#0F172A] mb-0.5">
                      {config.label}
                    </h3>
                    <p className="text-[12px] text-[#94A3B8] leading-relaxed truncate">
                      {config.description}
                    </p>
                  </div>
                  <ArrowRight className="size-4 text-[#CBD5E1] group-hover:text-[#94A3B8] shrink-0 transition-colors" />
                </button>
              )
            )}
          </div>
        </div>
      </div>
    );
  }

  // 서브타입 선택 화면
  const scenarioConfig = SCENARIO_CONFIG[selectedScenario];
  const subTypes = Object.entries(scenarioConfig.subTypes);

  return (
    <div className="flex flex-col h-full">
      {/* 상단 고정 뒤로가기 */}
      <div className="shrink-0 px-4 py-3 border-b border-[#E2E8F0]">
        <button
          type="button"
          onClick={handleBack}
          disabled={disabled}
          className="flex items-center gap-1 text-sm text-[#64748B] hover:text-[#334155] transition-colors disabled:opacity-40"
        >
          <ChevronLeft className="size-4" />
          뒤로
        </button>
      </div>

      {/* 콘텐츠 - 중앙 정렬 */}
      <div className="flex-1 flex flex-col justify-center px-6 py-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-4">
            {SCENARIO_ICONS[scenarioConfig.icon] ?? <Phone className="size-5 text-[#0F172A]" />}
          </div>
          <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1.5">
            {scenarioConfig.label}
          </h2>
          <p className="text-sm text-[#94A3B8]">
            어떤 종류인가요?
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2.5 max-w-sm mx-auto w-full">
          {subTypes.map(([subType, subConfig]) => (
            <button
              key={subType}
              type="button"
              disabled={disabled}
              onClick={() => handleSubTypeClick(subType as ScenarioSubType)}
              className="group flex flex-col items-center justify-center p-4 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 min-h-[72px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-[13px] font-semibold text-[#0F172A]">
                {subConfig.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default ScenarioSelector;
