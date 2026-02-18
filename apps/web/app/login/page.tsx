"use client";

import { useTranslations } from "next-intl";
import LoginForm from "@/components/auth/LoginForm";
import OAuthButtons from "@/components/auth/OAuthButtons";
import LanguageSwitcher from "@/components/common/LanguageSwitcher";
import { Zap } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("login");

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-5 bg-[#F8FAFC]">
      {/* Language Switcher - 우상단 고정 */}
      <div className="absolute top-5 right-5 z-10">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-sm space-y-8">
        {/* 히어로 */}
        <div className="text-center space-y-5">
          <div className="flex items-center justify-center mb-6">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-[#F1F5F9] glow-accent">
              <Zap className="size-7 text-[#0F172A]" />
            </div>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#0F172A] leading-tight">
            {/* {t('title')} */}
            WIGVO
          </h1>
          <p className="text-sm text-[#64748B] leading-relaxed max-w-xs mx-auto whitespace-pre-line">
            {t("subtitle")}
          </p>
        </div>

        {/* 이메일/비밀번호 로그인 폼 */}
        <LoginForm />

        {/* 구분선 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E2E8F0]" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-[#F8FAFC] text-[#94A3B8]">{t("or")}</span>
          </div>
        </div>

        {/* OAuth 버튼들 */}
        <OAuthButtons />

        {/* 이용약관 */}
        <p className="text-center text-[11px] text-[#94A3B8] px-4 leading-relaxed">
          {t("terms")}
        </p>
      </div>
    </div>
  );
}
