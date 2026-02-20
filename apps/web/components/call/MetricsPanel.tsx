'use client';

import type { CallMetrics } from '@/hooks/useRelayCallStore';

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function last(arr: number[]): number {
  return arr.length > 0 ? arr[arr.length - 1] : 0;
}

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-2">
      <p className="text-[10px] font-medium text-[#94A3B8] uppercase tracking-wider">{label}</p>
      <p className="text-lg font-semibold text-[#1E293B] tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-[#64748B]">{sub}</p>}
    </div>
  );
}

export default function MetricsPanel({ metrics }: { metrics: CallMetrics | null }) {
  if (!metrics) return null;

  const aLatency = last(metrics.session_a_latencies_ms);
  const aAvg = avg(metrics.session_a_latencies_ms);
  const bLatency = last(metrics.session_b_e2e_latencies_ms);
  const bAvg = avg(metrics.session_b_e2e_latencies_ms);

  return (
    <div className="grid grid-cols-2 gap-2 px-4 py-3 border-t border-[#E2E8F0] bg-[#F8FAFC]">
      <StatCard
        label="Session A"
        value={`${Math.round(aLatency)}ms`}
        sub={`avg ${Math.round(aAvg)}ms`}
      />
      <StatCard
        label="Session B"
        value={`${Math.round(bLatency)}ms`}
        sub={`avg ${Math.round(bAvg)}ms`}
      />
      <StatCard
        label="Turns"
        value={String(metrics.turn_count)}
      />
      <StatCard
        label="Echo"
        value={`${metrics.echo_suppressions} / ${metrics.echo_loops_detected}`}
        sub="suppress / loops"
      />
      <StatCard
        label="Hallucinations"
        value={String(metrics.hallucinations_blocked)}
        sub="blocked"
      />
      <StatCard
        label="VAD False"
        value={String(metrics.vad_false_triggers)}
        sub="triggers"
      />
    </div>
  );
}
