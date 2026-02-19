'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Zap } from 'lucide-react';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('common');

  if (pathname === '/login') return null;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('currentConversationId');
    router.push('/login');
  };

  return (
    <header className="h-14 border-b border-[#E2E8F0] bg-white">
      <div className="h-full flex items-center justify-between px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-[#F1F5F9] glow-accent">
            <Zap className="size-4 text-[#0F172A]" />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">
            WIGVO
          </span>
        </Link>

        <div className="flex items-center gap-3">
          <LanguageSwitcher direction="down" />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-1.5 text-xs text-[#94A3B8] hover:text-[#64748B] transition-colors"
          >
            <LogOut className="size-3.5" />
            <span className="hidden sm:inline">{t('logout')}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
