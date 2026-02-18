// ============================================================================
// i18n Configuration
// ============================================================================
// Purpose: Internationalization setup using next-intl
// Default language: English (for international users)
// Note: ElevenLabs agent always speaks Korean (for Korean stores)
// ============================================================================

import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'ko'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export default getRequestConfig(async () => {
  // In a real app, you might want to get this from cookies or headers
  // For now, we'll use a client-side approach with localStorage
  const locale = defaultLocale;

  return {
    locale,
    timeZone: 'Asia/Seoul',
    messages: (await import(`@/messages/${locale}.json`)).default,
  };
});

// Helper to get locale from localStorage (client-side only)
export function getStoredLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale;
  const stored = localStorage.getItem('locale');
  if (stored && locales.includes(stored as Locale)) {
    return stored as Locale;
  }
  return defaultLocale;
}

// Helper to set locale in localStorage
export function setStoredLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem('locale', locale);
}
