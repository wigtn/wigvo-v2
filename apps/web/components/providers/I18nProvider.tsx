'use client';

import { NextIntlClientProvider } from 'next-intl';
import { useState, useEffect, ReactNode } from 'react';
import { getStoredLocale, type Locale } from '@/lib/i18n';

// Import messages statically
import koMessages from '@/messages/ko.json';
import enMessages from '@/messages/en.json';

const messages: Record<Locale, typeof koMessages> = {
  ko: koMessages,
  en: enMessages,
};

interface I18nProviderProps {
  children: ReactNode;
}

export default function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocale] = useState<Locale>('en');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Get stored locale on mount
    const storedLocale = getStoredLocale();
    setLocale(storedLocale);
    setMounted(true);

    // Listen for locale changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'locale' && e.newValue) {
        setLocale(e.newValue as Locale);
      }
    };

    // Custom event for same-tab locale changes
    const handleLocaleChange = (e: CustomEvent<Locale>) => {
      setLocale(e.detail);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('localeChange', handleLocaleChange as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('localeChange', handleLocaleChange as EventListener);
    };
  }, []);

  // Prevent hydration mismatch by showing nothing until mounted
  if (!mounted) {
    return (
      <NextIntlClientProvider locale="en" messages={messages.en} timeZone="Asia/Seoul">
        {children}
      </NextIntlClientProvider>
    );
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages[locale]} timeZone="Asia/Seoul">
      {children}
    </NextIntlClientProvider>
  );
}

// Helper function to change locale and trigger re-render
export function changeLocale(newLocale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('locale', newLocale);
  window.dispatchEvent(new CustomEvent('localeChange', { detail: newLocale }));
}
