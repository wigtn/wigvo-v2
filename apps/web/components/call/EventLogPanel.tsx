'use client';

import { useEffect, useRef } from 'react';
import { useRelayCallStore } from '@/hooks/useRelayCallStore';

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  const s = d.getSeconds().toString().padStart(2, '0');
  const ms = Math.floor(d.getMilliseconds() / 100);
  return `${h}:${m}:${s}.${ms}`;
}

export default function EventLogPanel() {
  const eventLog = useRelayCallStore((s) => s.eventLog);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only auto-scroll if user is near the bottom (within 60px)
    const el = containerRef.current;
    if (el) {
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      if (nearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [eventLog.length]);

  return (
    <div
      ref={containerRef}
      className="border-t border-[#1E293B] bg-[#0F172A] max-h-[40vh] overflow-y-auto font-mono text-[11px] leading-relaxed"
    >
      {/* Header */}
      <div className="sticky top-0 bg-[#0F172A] border-b border-[#1E293B] px-3 py-1.5 flex items-center justify-between">
        <span className="text-[#64748B] text-[10px] font-medium">
          Event Log ({eventLog.length})
        </span>
      </div>

      {/* Log entries */}
      <div className="px-3 py-1">
        {eventLog.length === 0 ? (
          <p className="text-[#475569] py-2">Waiting for events...</p>
        ) : (
          eventLog.map((entry) => (
            <div key={entry.id} className="flex gap-2 py-0.5">
              <span className="text-[#475569] shrink-0">{formatTime(entry.timestamp)}</span>
              <span className={`shrink-0 font-semibold ${entry.color}`}>
                [{entry.tag}]
              </span>
              <span className="text-[#CBD5E1] break-all">{entry.message}</span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
