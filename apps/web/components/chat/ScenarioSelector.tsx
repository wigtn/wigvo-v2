'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronLeft, CalendarCheck, Search, Wrench, ArrowRight, ArrowLeftRight, Phone, Mic, MessageSquare, Captions, Bot } from 'lucide-react';
import type { ScenarioType, ScenarioSubType } from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE_PAIR } from '@/shared/call-types';
import { SCENARIO_CONFIG } from '@/lib/scenarios/config';

const SCENARIO_ICONS: Record<string, React.ReactNode> = {
  calendar: <CalendarCheck className="size-5 text-[#0F172A]" />,
  search: <Search className="size-5 text-[#0F172A]" />,
  wrench: <Wrench className="size-5 text-[#0F172A]" />,
};

interface ModeOption {
  mode: CommunicationMode;
  icon: React.ReactNode;
  titleKey: string;
  subtitleKey: string;
  descKey: string;
}

const MODE_OPTIONS: ModeOption[] = [
  {
    mode: 'voice_to_voice',
    icon: <Mic className="size-5" />,
    titleKey: 'voiceToVoice',
    subtitleKey: 'voiceToVoiceSubtitle',
    descKey: 'voiceToVoiceDesc',
  },
  {
    mode: 'text_to_voice',
    icon: <MessageSquare className="size-5" />,
    titleKey: 'textToVoice',
    subtitleKey: 'textToVoiceSubtitle',
    descKey: 'textToVoiceDesc',
  },
  {
    mode: 'voice_to_text',
    icon: <Captions className="size-5" />,
    titleKey: 'voiceToText',
    subtitleKey: 'voiceToTextSubtitle',
    descKey: 'voiceToTextDesc',
  },
  {
    mode: 'full_agent',
    icon: <Bot className="size-5" />,
    titleKey: 'fullAgent',
    subtitleKey: 'fullAgentSubtitle',
    descKey: 'fullAgentDesc',
  },
];

interface ScenarioSelectorProps {
  onSelect: (scenarioType: ScenarioType, subType: ScenarioSubType, communicationMode: CommunicationMode, sourceLang: string, targetLang: string) => void;
  disabled?: boolean;
}

type Screen = 'mode' | 'scenario' | 'subtype';

export function ScenarioSelector({ onSelect, disabled = false }: ScenarioSelectorProps) {
  const t = useTranslations('scenario');
  const tModes = useTranslations('scenario.modes');
  const tc = useTranslations('common');
  const [screen, setScreen] = useState<Screen>('mode');
  const [selectedMode, setSelectedMode] = useState<CommunicationMode | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);
  const [sourceLang, setSourceLang] = useState(DEFAULT_LANGUAGE_PAIR.source.code);
  const [targetLang, setTargetLang] = useState(DEFAULT_LANGUAGE_PAIR.target.code);

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

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
      onSelect(selectedScenario, subType, selectedMode, sourceLang, targetLang);
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
          {/* 언어 페어 선택기 */}
          <div className="flex items-center justify-center gap-2 mb-6 max-w-sm mx-auto w-full">
            <select
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              disabled={disabled}
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] focus:outline-none focus:border-[#CBD5E1] transition-colors disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSwapLanguages}
              disabled={disabled}
              className="shrink-0 w-8 h-8 rounded-lg bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:bg-[#E2E8F0] transition-colors disabled:opacity-50"
              aria-label="Swap languages"
            >
              <ArrowLeftRight className="size-3.5" />
            </button>
            <select
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              disabled={disabled}
              className="flex-1 px-3 py-2 text-sm rounded-xl border border-[#E2E8F0] bg-white text-[#0F172A] focus:outline-none focus:border-[#CBD5E1] transition-colors disabled:opacity-50"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.flag} {lang.label}
                </option>
              ))}
            </select>
          </div>

          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-5 glow-accent">
              <Phone className="size-5 text-[#0F172A]" />
            </div>
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1.5">
              {t.rich('modeTitle', { accent: (chunks) => <span className="text-gradient">{chunks}</span> })}
            </h2>
            <p className="text-sm text-[#94A3B8]">
              {t('modeSubtitle')}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 max-w-sm mx-auto w-full">
            {MODE_OPTIONS.map(({ mode, icon, titleKey, subtitleKey, descKey }) => (
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
                  {tModes(titleKey)}
                </h3>
                <p className="text-[10px] text-[#94A3B8] leading-tight mb-1">
                  {tModes(subtitleKey)}
                </p>
                <p className="text-[10px] text-[#64748B] leading-snug">
                  {tModes(descKey)}
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
            {tc('back')}
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-center px-6 py-8">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-[#F1F5F9] flex items-center justify-center mx-auto mb-5 glow-accent">
              <Phone className="size-5 text-[#0F172A]" />
            </div>
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1.5">
              {t.rich('scenarioTitle', { accent: (chunks) => <span className="text-gradient">{chunks}</span> })}
            </h2>
            <p className="text-sm text-[#94A3B8]">
              {t('scenarioSubtitle')}
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
          {tc('back')}
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
            {t('subtypeQuestion')}
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
