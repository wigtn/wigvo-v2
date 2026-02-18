'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ArrowLeftRight,
  Phone,
  Mic,
  MessageSquare,
  Captions,
  Bot,
  ChevronDown,
  Send,
} from 'lucide-react';
import type { ScenarioType, ScenarioSubType } from '@/shared/types';
import type { CommunicationMode } from '@/shared/call-types';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE_PAIR } from '@/shared/call-types';

// ── Quick Action 정의 ─────────────────────────────────────────
interface QuickAction {
  emoji: string;
  scenarioType: ScenarioType;
  subType: ScenarioSubType;
  labelKey: string;
  descKey: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { emoji: '🍽️', scenarioType: 'RESERVATION', subType: 'RESTAURANT', labelKey: 'restaurant', descKey: 'restaurantDesc' },
  { emoji: '💇', scenarioType: 'RESERVATION', subType: 'SALON', labelKey: 'salon', descKey: 'salonDesc' },
  { emoji: '🏥', scenarioType: 'RESERVATION', subType: 'HOSPITAL', labelKey: 'hospital', descKey: 'hospitalDesc' },
  { emoji: '🏨', scenarioType: 'RESERVATION', subType: 'HOTEL', labelKey: 'hotel', descKey: 'hotelDesc' },
  { emoji: '🔍', scenarioType: 'INQUIRY', subType: 'OTHER', labelKey: 'inquiry', descKey: 'inquiryDesc' },
  { emoji: '🔧', scenarioType: 'AS_REQUEST', subType: 'OTHER', labelKey: 'asRequest', descKey: 'asRequestDesc' },
];

// ── Mode Option 정의 ─────────────────────────────────────────
interface ModeOption {
  mode: CommunicationMode;
  icon: typeof Mic;
  labelKey: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { mode: 'voice_to_voice', icon: Mic, labelKey: 'voiceToVoice' },
  { mode: 'text_to_voice', icon: MessageSquare, labelKey: 'textToVoice' },
  { mode: 'voice_to_text', icon: Captions, labelKey: 'voiceToText' },
  { mode: 'full_agent', icon: Bot, labelKey: 'fullAgent' },
];

// ── Props ────────────────────────────────────────────────────
interface ScenarioSelectorProps {
  onSelect: (
    scenarioType: ScenarioType,
    subType: ScenarioSubType,
    communicationMode: CommunicationMode,
    sourceLang: string,
    targetLang: string,
  ) => void;
  disabled?: boolean;
}

export function ScenarioSelector({ onSelect, disabled = false }: ScenarioSelectorProps) {
  const t = useTranslations('scenario');
  const tModes = useTranslations('scenario.modes');
  const tQuick = useTranslations('scenario.quick');
  const locale = useLocale();

  // Sync source language with UI locale: if UI is English, user speaks English (source=en, target=ko)
  const defaultSource = locale === 'ko' ? DEFAULT_LANGUAGE_PAIR.source.code : 'en';
  const defaultTarget = locale === 'ko' ? DEFAULT_LANGUAGE_PAIR.target.code : 'ko';
  const [sourceLang, setSourceLang] = useState(defaultSource);
  const [targetLang, setTargetLang] = useState(defaultTarget);
  const [communicationMode, setCommunicationMode] = useState<CommunicationMode>('voice_to_voice');
  const [isModeOpen, setIsModeOpen] = useState(false);
  const [freeText, setFreeText] = useState('');

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (disabled) return;
      onSelect(action.scenarioType, action.subType, communicationMode, sourceLang, targetLang);
    },
    [communicationMode, sourceLang, targetLang, disabled, onSelect],
  );

  const handleFreeTextSubmit = useCallback(() => {
    const text = freeText.trim();
    if (!text || disabled) return;
    // 자유 입력 → INQUIRY/OTHER로 시작, AI가 대화에서 판별
    onSelect('INQUIRY', 'OTHER', communicationMode, sourceLang, targetLang);
  }, [freeText, communicationMode, sourceLang, targetLang, disabled, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFreeTextSubmit();
      }
    },
    [handleFreeTextSubmit],
  );

  const selectedModeOption = MODE_OPTIONS.find((m) => m.mode === communicationMode)!;
  const SelectedIcon = selectedModeOption.icon;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col justify-center px-5 py-6 overflow-y-auto">
        {/* 언어 페어 */}
        <div className="flex items-center justify-center gap-2 mb-5 max-w-xs mx-auto w-full">
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

        {/* 헤더 */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1">
            {t.rich('quickTitle', { accent: (chunks) => <span className="text-gradient">{chunks}</span> })}
          </h2>
          <p className="text-sm text-[#94A3B8]">
            {t('quickSubtitle')}
          </p>
        </div>

        {/* 퀵액션 그리드 */}
        <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto w-full mb-5">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={`${action.scenarioType}-${action.subType}`}
              type="button"
              disabled={disabled}
              onClick={() => handleQuickAction(action)}
              className="group flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)] active:scale-[0.97] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-2xl leading-none">{action.emoji}</span>
              <span className="text-[11px] font-semibold text-[#0F172A] leading-tight text-center">
                {tQuick(action.labelKey)}
              </span>
              <span className="text-[9px] text-[#94A3B8] leading-tight text-center hidden sm:block">
                {tQuick(action.descKey)}
              </span>
            </button>
          ))}
        </div>

        {/* 통화 모드 셀렉터 (축소형) */}
        <div className="max-w-xs mx-auto w-full mb-4">
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModeOpen(!isModeOpen)}
              disabled={disabled}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] text-sm text-[#64748B] hover:bg-[#F1F5F9] transition-colors disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <SelectedIcon className="size-3.5" />
                <span className="text-xs font-medium">
                  {t('modeLabel')}: {tModes(selectedModeOption.labelKey)}
                </span>
              </div>
              <ChevronDown className={`size-3.5 transition-transform ${isModeOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* 드롭다운 */}
            {isModeOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white rounded-xl border border-[#E2E8F0] shadow-[0_4px_16px_rgba(0,0,0,0.08)] overflow-hidden z-10">
                {MODE_OPTIONS.map(({ mode, icon: Icon, labelKey }) => {
                  const isSelected = mode === communicationMode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => {
                        setCommunicationMode(mode);
                        setIsModeOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        isSelected
                          ? 'bg-[#F1F5F9] text-[#0F172A]'
                          : 'text-[#64748B] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span className={`text-xs ${isSelected ? 'font-semibold' : 'font-medium'}`}>
                        {tModes(labelKey)}
                      </span>
                      {isSelected && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#0F172A]" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 구분선 + 자유 입력 */}
        <div className="max-w-xs mx-auto w-full">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-[#E2E8F0]" />
            <span className="text-[10px] text-[#CBD5E1] font-medium uppercase tracking-wider">
              {t('orFreeInput')}
            </span>
            <div className="flex-1 h-px bg-[#E2E8F0]" />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={t('freeInputPlaceholder')}
              className="flex-1 rounded-xl border border-[#E2E8F0] px-3 py-2.5 text-sm text-[#334155] placeholder:text-[#CBD5E1] focus:outline-none focus:ring-1 focus:ring-[#0F172A] disabled:opacity-50"
            />
            <button
              type="button"
              onClick={handleFreeTextSubmit}
              disabled={!freeText.trim() || disabled}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0F172A] text-white transition-colors hover:bg-[#1E293B] disabled:opacity-30"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ScenarioSelector;
