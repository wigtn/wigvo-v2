'use client';

import { useState, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Globe } from 'lucide-react';
import { changeLocale } from '@/components/providers/I18nProvider';
import { getStoredLocale, type Locale } from '@/lib/i18n';

interface LanguageSwitcherProps {
  direction?: 'up' | 'down';
}

export default function LanguageSwitcher({ direction = 'up' }: LanguageSwitcherProps) {
  const t = useTranslations('language');
  const [isOpen, setIsOpen] = useState(false);
  const [currentLocale, setCurrentLocale] = useState<Locale>('en');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentLocale(getStoredLocale());

    // Listen for locale changes
    const handleLocaleChange = (e: CustomEvent<Locale>) => {
      setCurrentLocale(e.detail);
    };

    window.addEventListener('localeChange', handleLocaleChange as EventListener);
    return () => {
      window.removeEventListener('localeChange', handleLocaleChange as EventListener);
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLocaleChange = (locale: Locale) => {
    changeLocale(locale);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-[#334155] bg-white border border-[#E2E8F0] rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.04)] hover:shadow-sm hover:border-[#CBD5E1] hover:text-[#0F172A] transition-all"
        aria-label="Change language"
      >
        <Globe className="w-4 h-4" />
        <span>{currentLocale === 'ko' ? '한국어' : 'English'}</span>
      </button>

      {isOpen && (
        <div className={`absolute right-0 w-36 bg-white border border-[#E2E8F0] rounded-xl shadow-lg overflow-hidden z-50 ${
          direction === 'down' ? 'top-full mt-2' : 'bottom-full mb-2'
        }`}>
          <button
            onClick={() => handleLocaleChange('en')}
            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[#F8FAFC] transition-colors ${
              currentLocale === 'en' ? 'text-[#0F172A] bg-[#F1F5F9] font-medium' : 'text-[#64748B]'
            }`}
          >
            {t('en')}
          </button>
          <button
            onClick={() => handleLocaleChange('ko')}
            className={`w-full px-4 py-2.5 text-left text-sm hover:bg-[#F8FAFC] transition-colors ${
              currentLocale === 'ko' ? 'text-[#0F172A] bg-[#F1F5F9] font-medium' : 'text-[#64748B]'
            }`}
          >
            {t('ko')}
          </button>
        </div>
      )}
    </div>
  );
}
