'use client';

import { useEffect, useState, useRef } from 'react';
import { MessageSquare, Clock, CheckCircle, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ConversationSummary } from '@/hooks/useDashboard';

interface ConversationListProps {
  onSelect: (id: string) => void;
  activeId: string | null;
}

export default function ConversationList({ onSelect, activeId }: ConversationListProps) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    async function fetchConversations() {
      try {
        const res = await fetch('/api/conversations');
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        setConversations(data.conversations || []);
      } catch {
        // 에러 무시
      } finally {
        setLoading(false);
      }
    }

    fetchConversations();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return <CheckCircle className="size-3.5 text-teal-500" />;
      case 'CALLING':
        return <Phone className="size-3.5 text-[#0F172A] animate-pulse" />;
      default:
        return <Clock className="size-3.5 text-[#CBD5E1]" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return '어제';
    } else if (days < 7) {
      return `${days}일 전`;
    } else {
      return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
    }
  };

  if (loading) {
    return (
      <div className="px-3 py-4">
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-14 bg-[#F1F5F9] rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="px-3 py-8 text-center">
        <MessageSquare className="mx-auto size-8 text-[#CBD5E1] mb-2" />
        <p className="text-sm text-[#94A3B8]">대화 기록이 없습니다</p>
      </div>
    );
  }

  return (
    <div className="px-2 py-2 space-y-0.5 max-h-[calc(100vh-200px)] overflow-y-auto styled-scrollbar">
      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={cn(
            'w-full text-left px-3 py-2.5 rounded-xl transition-all',
            'hover:bg-[#F8FAFC]',
            activeId === conv.id && 'bg-[#F1F5F9]'
          )}
        >
          <div className="flex items-start gap-2">
            {getStatusIcon(conv.status)}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#0F172A] truncate">
                {conv.targetName || '새 대화'}
              </p>
              <p className="text-xs text-[#94A3B8] truncate mt-0.5">
                {conv.lastMessage}
              </p>
            </div>
            <span className="text-[10px] text-[#CBD5E1] shrink-0">
              {formatDate(conv.createdAt)}
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}
