'use client';

import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

interface LoginButtonProps {
  provider: 'google' | 'apple' | 'kakao';
  label: string;
  icon: string;
}

export default function LoginButton({ provider, label, icon }: LoginButtonProps) {
  const handleLogin = async () => {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  return (
    <Button
      variant="outline"
      className="w-full h-12 text-base font-medium gap-3 rounded-xl border-gray-300 hover:bg-gray-50"
      onClick={handleLogin}
    >
      <span className="text-xl">{icon}</span>
      {label}
    </Button>
  );
}
