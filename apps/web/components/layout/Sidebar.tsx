'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { LogOut, Zap, MessageSquare, Phone, CalendarCheck } from 'lucide-react';
import Link from 'next/link';

interface NavItem {
  href: string;
  icon: typeof MessageSquare;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', icon: MessageSquare, label: '에이전트' },
  { href: '/history', icon: Phone, label: '통화기록' },
  { href: '/history', icon: CalendarCheck, label: '예약 내역' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // 로그인 페이지에서는 사이드바 숨김
  if (pathname === '/login') return null;

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    localStorage.removeItem('currentConversationId');
    router.push('/login');
  };

  const checkActive = (href: string, idx: number) => {
    // 에이전트 — 정확히 / 에서만
    if (idx === 0) return pathname === '/';
    // 통화기록 — /history, /calling, /result
    if (idx === 1)
      return (
        pathname.startsWith('/history') ||
        pathname.startsWith('/calling') ||
        pathname.startsWith('/result')
      );
    // 예약 내역 — 전용 페이지 미구현, 비활성 유지
    return false;
  };

  return (
    <aside className="hidden lg:flex shrink-0 w-[220px] flex-col h-full bg-white border-r border-[#E2E8F0]">
      {/* ── 로고 ── */}
      <div className="h-14 flex items-center px-5 border-b border-[#E2E8F0]">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center glow-purple">
            <Zap className="size-4 text-violet-600" />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[#0F172A]">
            WIGVO
          </span>
        </Link>
      </div>

      {/* ── 네비게이션 ── */}
      <nav className="flex-1 px-3 pt-6">
        <p className="px-3 mb-2.5 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-[0.08em]">
          메뉴
        </p>
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label }, idx) => {
            const active = checkActive(href, idx);
            return (
              <li key={label}>
                <Link
                  href={href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all ${
                    active
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-[#64748B] hover:text-[#334155] hover:bg-[#F8FAFC]'
                  }`}
                >
                  <Icon
                    className={`size-[18px] shrink-0 ${
                      active ? 'text-violet-600' : ''
                    }`}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── 하단 ── */}
      <div className="px-3 pb-5">
        <div className="border-t border-[#E2E8F0] mx-2 mb-3" />
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-[13px] text-[#94A3B8] hover:text-red-500 hover:bg-red-50/50 transition-all"
        >
          <LogOut className="size-[18px] shrink-0" />
          로그아웃
        </button>
      </div>
    </aside>
  );
}
