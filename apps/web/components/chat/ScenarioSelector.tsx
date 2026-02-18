'use client';

import { useState } from 'react';
import { ChevronLeft, CalendarCheck, Search, Wrench, ArrowRight, Phone, Mic, MessageSquare, Captions, Bot } from 'lucide-react';
import type { ScenarioType, ScenarioSubType } from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import { SCENARIO_CONFIG } from '@/lib/scenarios/config';

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  calendar: <CalendarCheck className="size-5 text-[#0F172A]" />,
  search: <Search className="size-5 text-[#0F172A]" />,
  wrench: <Wrench className="size-5 text-[#0F172A]" />,
};

interface ModeOption {
  mode: CommunicationMode;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'voice_to_voice',
    icon: <Mic className="size-5" />,
    title: '양방향 음성 번역',
    subtitle: 'Voice Translation',
    description: '모국어로 말하면 실시간 번역됩니다',
  },
  {
    mode: 'text_to_voice',
    icon: <MessageSquare className="size-5" />,
    title: '텍스트 → 음성',
    subtitle: 'Text to Voice',
    description: '텍스트를 입력하면 AI가 대신 말합니다',
  },
  {
    mode: 'voice_to_text',
    icon: <Captions className="size-5" />,
    title: '음성 → 자막',
    subtitle: 'Voice to Text',
    description: '상대방 말이 자막으로 표시됩니다',
  },
  {
    mode: 'full_agent',
    icon: <Bot className="size-5" />,
    title: 'AI 자율 통화',
    subtitle: 'AI Agent',
    description: 'AI가 수집된 정보로 통화를 진행합니다',
  },
];

interface ScenarioSelectorProps {
  onSelect: (scenarioType: ScenarioType, subType: ScenarioSubType, communicationMode: CommunicationMode) => void;
  disabled?: boolean;
}

type Screen = 'mode' | 'scenario' | 'subtype';

export function ScenarioSelector({ onSelect, disabled = false }: ScenarioSelectorProps) {
  const [screen, setScreen] = useState<Screen>('mode');
  const [selectedMode, setSelectedMode] = useState<CommunicationMode | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);

  const handleModeClick = (mode: CommunicationMode) => {
    setSelectedMode(mode);
    setScreen('scenario');
  };

  const handleScenarioClick = (scenarioType: ScenarioType) => {
    setSelectedScenario(scenarioType);
    setScreen('subtype');
  };

  const handleSubTypeClick = (subType: ScenarioSubType) => {
    if (selectedScenario && selectedMode) {
      onSelect(selectedScenario, subType, selectedMode);
    }
  };

  const handleBack = () => {
    if (screen === 'subtype') {
      setSelectedScenario(null);
      setScreen('scenario');
    } else if (screen === 'scenario') {
      setSelectedMode(null);
      setScreen('mode');
    }
  };

  // Screen 1: 통화 모드 선택
  if (screen === 'mode') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-5 glow-accent">
              <Phone className="size-5 text-[#0F172A]" />
            </div>
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1.5">
              어떤 방식으로 <span className="text-gradient">통화</span>할까요?
            </h2>
            <p className="text-sm text-[#94A3B8]">
              통화 방식에 따라 필요한 정보가 달라집니다
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 max-w-sm mx-auto w-full">
            {MODE_OPTIONS.map(({ mode, icon, title, subtitle, description }) => (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                onClick={() => handleModeClick(mode)}
                className="group flex flex-col p-4 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[#F1F5F9] flex items-center justify-center shrink-0 text-[#0F172A] group-hover:bg-[#0F172A] group-hover:text-white transition-colors">
                    {icon}
                  </div>
                </div>
                <h3 className="text-[13px] font-bold text-[#0F172A] leading-tight mb-0.5">
                  {title}
                </h3>
                <p className="text-[10px] text-[#94A3B8] leading-tight mb-1">
                  {subtitle}
                </p>
                <p className="text-[10px] text-[#64748B] leading-snug">
                  {description}
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: 시나리오 선택
  if (screen === 'scenario') {
    return (
      <div className="flex flex-col h-full">
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

  // Screen 3: 서브타입 선택
  const scenarioConfig = SCENARIO_CONFIG[selectedScenario!];
  const subTypes = Object.entries(scenarioConfig.subTypes);

  return (
    <div className="flex flex-col h-full">
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
