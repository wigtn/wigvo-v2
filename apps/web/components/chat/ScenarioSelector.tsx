'use client';

import { useState, useCallback } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import {
  ArrowLeftRight,
  Phone,
  Mic,
  MessageSquare,
  Bot,
  Captions,
  ChevronLeft,
  Send,
} from 'lucide-react';
import type { ScenarioType, ScenarioSubType } from '@/shared/types';
import type { CommunicationMode, CallCategory } from '@/shared/call-types';
import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE_PAIR, resolveDirectMode } from '@/shared/call-types';
import type { DirectCallOptions } from '@/shared/call-types';

// ── Quick Action (AI Auto only) ────────────────────────────────
interface QuickAction {
  emoji: string;
  scenarioType: ScenarioType;
  subType: ScenarioSubType;
  labelKey: string;
  descKey: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { emoji: '\uD83C\uDF7D\uFE0F', scenarioType: 'RESERVATION', subType: 'RESTAURANT', labelKey: 'restaurant', descKey: 'restaurantDesc' },
  { emoji: '\uD83D\uDC87', scenarioType: 'RESERVATION', subType: 'SALON', labelKey: 'salon', descKey: 'salonDesc' },
  { emoji: '\uD83C\uDFE5', scenarioType: 'RESERVATION', subType: 'HOSPITAL', labelKey: 'hospital', descKey: 'hospitalDesc' },
  { emoji: '\uD83C\uDFE8', scenarioType: 'RESERVATION', subType: 'HOTEL', labelKey: 'hotel', descKey: 'hotelDesc' },
  { emoji: '\uD83D\uDD0D', scenarioType: 'INQUIRY', subType: 'OTHER', labelKey: 'inquiry', descKey: 'inquiryDesc' },
  { emoji: '\uD83D\uDD27', scenarioType: 'AS_REQUEST', subType: 'OTHER', labelKey: 'asRequest', descKey: 'asRequestDesc' },
];

// ── Props ───────────────────────────────────────────────────────
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

type Step = 'category' | 'direct' | 'ai_auto';

export function ScenarioSelector({ onSelect, disabled = false }: ScenarioSelectorProps) {
  const t = useTranslations('scenario');
  const tCat = useTranslations('scenario.category');
  const tDirect = useTranslations('scenario.direct');
  const tAiAuto = useTranslations('scenario.aiAuto');
  const tQuick = useTranslations('scenario.quick');
  const locale = useLocale();

  // Language pair
  const defaultSource = locale === 'ko' ? DEFAULT_LANGUAGE_PAIR.source.code : 'en';
  const defaultTarget = locale === 'ko' ? DEFAULT_LANGUAGE_PAIR.target.code : 'ko';
  const [sourceLang, setSourceLang] = useState(defaultSource);
  const [targetLang, setTargetLang] = useState(defaultTarget);

  // Step navigation
  const [step, setStep] = useState<Step>('category');

  // Direct call options
  const [inputMethod, setInputMethod] = useState<'voice' | 'text'>('voice');
  const [outputMethod, setOutputMethod] = useState<'voice' | 'caption'>('voice');

  // AI Auto free text
  const [freeText, setFreeText] = useState('');

  const handleSwapLanguages = () => {
    setSourceLang(targetLang);
    setTargetLang(sourceLang);
  };

  // ── Category selection ──────────────────────────────────────
  const handleCategorySelect = useCallback((category: CallCategory) => {
    if (disabled) return;
    if (category === 'direct') {
      setStep('direct');
    } else {
      setStep('ai_auto');
    }
  }, [disabled]);

  const handleBack = useCallback(() => {
    setStep('category');
  }, []);

  // ── Direct call: start ──────────────────────────────────────
  const handleDirectStart = useCallback(() => {
    if (disabled) return;
    const options: DirectCallOptions = {
      translation: true,
      inputMethod,
      outputMethod,
    };
    const mode = resolveDirectMode(options);
    // Direct calls use INQUIRY/OTHER as placeholder scenario (no AI chat needed)
    onSelect('INQUIRY', 'OTHER', mode, sourceLang, targetLang);
  }, [disabled, inputMethod, outputMethod, sourceLang, targetLang, onSelect]);

  // ── AI Auto: quick action ───────────────────────────────────
  const handleQuickAction = useCallback(
    (action: QuickAction) => {
      if (disabled) return;
      onSelect(action.scenarioType, action.subType, 'full_agent', sourceLang, targetLang);
    },
    [sourceLang, targetLang, disabled, onSelect],
  );

  // ── AI Auto: free text ──────────────────────────────────────
  const handleFreeTextSubmit = useCallback(() => {
    const text = freeText.trim();
    if (!text || disabled) return;
    onSelect('INQUIRY', 'OTHER', 'full_agent', sourceLang, targetLang);
  }, [freeText, sourceLang, targetLang, disabled, onSelect]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleFreeTextSubmit();
      }
    },
    [handleFreeTextSubmit],
  );

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 1: Category selection (Direct vs AI Auto)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (step === 'category') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col justify-center px-5 py-6 overflow-y-auto">
          {/* Language pair */}
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

          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-bold text-[#0F172A] tracking-tight mb-1">
              {t.rich('title', { accent: (chunks) => <span className="text-gradient">{chunks}</span> })}
            </h2>
            <p className="text-sm text-[#94A3B8]">{t('subtitle')}</p>
          </div>

          {/* Category cards */}
          <div className="flex flex-col gap-3 max-w-xs mx-auto w-full">
            {/* Direct Call */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCategorySelect('direct')}
              className="group flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center">
                <Phone className="size-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#0F172A]">{tCat('directTitle')}</p>
                <p className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">{tCat('directSubtitle')}</p>
                <p className="text-xs text-[#64748B] mt-0.5 leading-snug">{tCat('directDesc')}</p>
              </div>
            </button>

            {/* AI Auto Call */}
            <button
              type="button"
              disabled={disabled}
              onClick={() => handleCategorySelect('ai_auto')}
              className="group flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#E2E8F0] hover:border-[#CBD5E1] hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] active:scale-[0.98] transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed text-left"
            >
              <div className="shrink-0 w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center">
                <Bot className="size-5 text-teal-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[#0F172A]">{tCat('aiAutoTitle')}</p>
                <p className="text-[10px] text-[#94A3B8] font-medium uppercase tracking-wider">{tCat('aiAutoSubtitle')}</p>
                <p className="text-xs text-[#64748B] mt-0.5 leading-snug">{tCat('aiAutoDesc')}</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 2a: Direct Call options
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (step === 'direct') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex-1 flex flex-col px-5 py-6 overflow-y-auto">
          {/* Back button */}
          <button
            type="button"
            onClick={handleBack}
            disabled={disabled}
            className="flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors mb-4 self-start"
          >
            <ChevronLeft className="size-3.5" />
            {tCat('directTitle')}
          </button>

          {/* Language pair (compact) */}
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

          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-lg font-bold text-[#0F172A] tracking-tight mb-1">
              {tDirect('title')}
            </h2>
            <p className="text-sm text-[#94A3B8]">{tDirect('subtitle')}</p>
          </div>

          <div className="max-w-xs mx-auto w-full space-y-5">
            {/* Input method */}
            <div>
              <p className="text-xs font-semibold text-[#64748B] mb-2 uppercase tracking-wider">
                {tDirect('inputLabel')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setInputMethod('voice')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    inputMethod === 'voice'
                      ? 'border-[#0F172A] bg-[#F8FAFC] ring-1 ring-[#0F172A]'
                      : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
                  } disabled:opacity-50`}
                >
                  <Mic className={`size-5 ${inputMethod === 'voice' ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`} />
                  <span className="text-xs font-medium text-[#0F172A]">{tDirect('inputVoice')}</span>
                  <span className="text-[9px] text-[#94A3B8] text-center leading-tight">{tDirect('inputVoiceDesc')}</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setInputMethod('text')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    inputMethod === 'text'
                      ? 'border-[#0F172A] bg-[#F8FAFC] ring-1 ring-[#0F172A]'
                      : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
                  } disabled:opacity-50`}
                >
                  <MessageSquare className={`size-5 ${inputMethod === 'text' ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`} />
                  <span className="text-xs font-medium text-[#0F172A]">{tDirect('inputText')}</span>
                  <span className="text-[9px] text-[#94A3B8] text-center leading-tight">{tDirect('inputTextDesc')}</span>
                </button>
              </div>
            </div>

            {/* Output method */}
            <div>
              <p className="text-xs font-semibold text-[#64748B] mb-2 uppercase tracking-wider">
                {tDirect('outputLabel')}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setOutputMethod('voice')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    outputMethod === 'voice'
                      ? 'border-[#0F172A] bg-[#F8FAFC] ring-1 ring-[#0F172A]'
                      : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
                  } disabled:opacity-50`}
                >
                  <Mic className={`size-5 ${outputMethod === 'voice' ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`} />
                  <span className="text-xs font-medium text-[#0F172A]">{tDirect('outputVoice')}</span>
                  <span className="text-[9px] text-[#94A3B8] text-center leading-tight">{tDirect('outputVoiceDesc')}</span>
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => setOutputMethod('caption')}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all ${
                    outputMethod === 'caption'
                      ? 'border-[#0F172A] bg-[#F8FAFC] ring-1 ring-[#0F172A]'
                      : 'border-[#E2E8F0] bg-white hover:border-[#CBD5E1]'
                  } disabled:opacity-50`}
                >
                  <Captions className={`size-5 ${outputMethod === 'caption' ? 'text-[#0F172A]' : 'text-[#94A3B8]'}`} />
                  <span className="text-xs font-medium text-[#0F172A]">{tDirect('outputCaption')}</span>
                  <span className="text-[9px] text-[#94A3B8] text-center leading-tight">{tDirect('outputCaptionDesc')}</span>
                </button>
              </div>
            </div>

            {/* Start call button */}
            <button
              type="button"
              onClick={handleDirectStart}
              disabled={disabled}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-[#0F172A] text-white px-4 py-3 text-sm font-medium transition-colors hover:bg-[#1E293B] disabled:opacity-40"
            >
              <Phone className="size-4" />
              {tDirect('startCall')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // Step 2b: AI Auto Call (scenario selection)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 flex flex-col px-5 py-6 overflow-y-auto">
        {/* Back button */}
        <button
          type="button"
          onClick={handleBack}
          disabled={disabled}
          className="flex items-center gap-1 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors mb-4 self-start"
        >
          <ChevronLeft className="size-3.5" />
          {tCat('aiAutoTitle')}
        </button>

        {/* Header */}
        <div className="text-center mb-6">
          <h2 className="text-lg font-bold text-[#0F172A] tracking-tight mb-1">
            {tAiAuto.rich('title', { accent: (chunks) => <span className="text-gradient">{chunks}</span> })}
          </h2>
          <p className="text-sm text-[#94A3B8]">{tAiAuto('subtitle')}</p>
        </div>

        {/* Quick action grid */}
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

        {/* Divider + free text */}
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
