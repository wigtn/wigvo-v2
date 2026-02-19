'use client';

import { useTranslations } from 'next-intl';
import type { Message } from '@/shared/types';
import { cn } from '@/lib/utils';

interface ChatMessageProps {
  message: Message;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const t = useTranslations('chat');
  const isUser = message.role === 'user';

  return (
    <div
      className={cn('flex w-full mb-4', isUser ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap',
          isUser
            ? 'bg-[#0F172A] text-white rounded-br-md'
            : 'surface-card shadow-sm text-[#334155] rounded-bl-md'
        )}
      >
        {!isUser && (
          <div className="text-[10px] text-[#64748B] font-medium mb-1.5 uppercase tracking-wider">
            {t('aiAssistant')}
          </div>
        )}
        {message.content}
      </div>
    </div>
  );
}
