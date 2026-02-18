'use client';

import { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
import { useTranslations } from 'next-intl';
import { ArrowUp } from 'lucide-react';

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export interface ChatInputHandle {
  focus: () => void;
}

const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(function ChatInput(
  {
    onSend,
    disabled = false,
    placeholder,
  },
  ref
) {
  const t = useTranslations('chat');
  const resolvedPlaceholder = placeholder ?? t('inputPlaceholder');
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => {
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  }));

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setValue('');

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  };

  const canSend = !disabled && value.trim().length > 0;

  return (
    <div className="px-4 py-3 border-t border-[#E2E8F0] bg-white pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
      <div className="flex items-end gap-2 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2 focus-within:border-[#94A3B8] focus-within:ring-2 focus-within:ring-[#F1F5F9] transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={resolvedPlaceholder}
          disabled={disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed py-1"
        />
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-200 ${
            canSend
              ? 'bg-[#0F172A] hover:bg-[#1E293B] text-white shadow-sm'
              : 'bg-[#E2E8F0] text-[#CBD5E1] cursor-not-allowed'
          }`}
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
    </div>
  );
});

export default ChatInput;
