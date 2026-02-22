#!/usr/bin/env bash
# check_all_calls.sh — 전체 통화 누적 통계 (논문 평가지표 기준)
# 의존성: curl, python3 (추가 패키지 불필요)
set -euo pipefail

# ── .env 로드 ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

SUPABASE_URL="${SUPABASE_URL:?SUPABASE_URL is not set}"
SB_KEY="${SUPABASE_SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_KEY:?Neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SERVICE_KEY is set}}"

API="$SUPABASE_URL/rest/v1"
AUTH_HEADERS=(-H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY")

# ── Fetch: 전체 calls (limit 1000) ──────────────────────────────────────────
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

curl -s "$API/calls?select=id,status,result,source_language,target_language,communication_mode,call_mode,duration_s,total_tokens,auto_ended,call_result_data,cost_tokens,transcript_bilingual,created_at&order=created_at.desc&limit=1000" \
  "${AUTH_HEADERS[@]}" \
  -H "Accept: application/json" > "$TMPFILE"

# ── Process ──────────────────────────────────────────────────────────────────
python3 - "$TMPFILE" << 'PYEOF'
import json, sys, math
from collections import Counter

# ── Helpers ──────────────────────────────────────────────────────────────────

def pct(values, p):
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * (p / 100)
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] * (c - k) + s[c] * (k - f)

def fmt_stats(values):
    if not values:
        return {"n": 0, "p50": 0, "p95": 0, "mean": 0, "max": 0}
    n = len(values)
    return {
        "n": n,
        "p50": pct(values, 50),
        "p95": pct(values, 95),
        "mean": sum(values) / n,
        "max": max(values),
    }

def pearson_r(x, y):
    n = len(x)
    if n < 2:
        return float("nan")
    mx, my = sum(x) / n, sum(y) / n
    cov = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    sx = sum((xi - mx) ** 2 for xi in x) ** 0.5
    sy = sum((yi - my) ** 2 for yi in y) ** 0.5
    if sx == 0 or sy == 0:
        return float("nan")
    return cov / (sx * sy)

# ── Load ─────────────────────────────────────────────────────────────────────

with open(sys.argv[1]) as f:
    data = json.load(f)

if not data:
    print("No calls found.")
    sys.exit(0)

# ── Aggregate ────────────────────────────────────────────────────────────────

total_calls = len(data)

# Separate instrumented (with metrics) vs all
instrumented = []
for c in data:
    m = (c.get("call_result_data") or {}).get("metrics")
    if m:
        instrumented.append((c, m))
n_instrumented = len(instrumented)

# Connected = COMPLETED + FAILED + ended (any call that got past INITIATED)
connected_statuses = {"COMPLETED", "FAILED", "ended"}
n_connected = sum(1 for c in data if c.get("status") in connected_statuses)

# Status / Mode distribution (across ALL calls)
status_counter = Counter(c.get("status") or "NULL" for c in data)
mode_counter = Counter()
MODE_LABELS = {
    "voice_to_voice": "V2V",
    "text_to_voice": "T2V",
    "full_agent": "Agent",
    "voice_to_text": "V2T",
}
for c in data:
    raw = c.get("communication_mode") or "unknown"
    mode_counter[MODE_LABELS.get(raw, raw)] += 1

# ── Latency aggregation (instrumented calls only) ────────────────────────────

all_sa, all_sb_e2e, all_sb_stt, all_sb_trans = [], [], [], []
all_paired_e2e, all_paired_stt = [], []
all_scatter = []
total_echo_supp = 0
total_echo_loops = 0
total_echo_breakthroughs = 0
total_vad_false = 0
total_hallucinations = 0
total_interrupts = 0
total_guardrail_l2 = 0
total_guardrail_l3 = 0
total_cost_usd = 0.0
total_tokens_sum = 0
total_duration = 0.0
n_with_duration = 0

for c, m in instrumented:
    sa = m.get("session_a_latencies_ms", [])
    sb_e2e = m.get("session_b_e2e_latencies_ms", [])
    sb_stt = m.get("session_b_stt_latencies_ms", [])

    all_sa.extend(sa)
    all_sb_e2e.extend(sb_e2e)
    all_sb_stt.extend(sb_stt)

    # Translation = E2E - STT (paired by turn index)
    paired_n = min(len(sb_e2e), len(sb_stt))
    for i in range(paired_n):
        all_paired_e2e.append(sb_e2e[i])
        all_paired_stt.append(sb_stt[i])
        t = sb_e2e[i] - sb_stt[i]
        if t >= 0:
            all_sb_trans.append(t)

    # Scatter: transcript_bilingual recipients x sb_e2e
    transcripts = c.get("transcript_bilingual") or []
    recipients = [t for t in transcripts if t.get("role") == "recipient"]
    for i in range(min(len(recipients), len(sb_e2e))):
        char_len = len(recipients[i].get("original_text", ""))
        all_scatter.append({"char_len": char_len, "latency_ms": sb_e2e[i]})

    # Counters
    total_echo_supp += m.get("echo_suppressions", 0)
    total_echo_loops += m.get("echo_loops_detected", 0)
    total_echo_breakthroughs += m.get("echo_gate_breakthroughs", 0)
    total_vad_false += m.get("vad_false_triggers", 0)
    total_hallucinations += m.get("hallucinations_blocked", 0)
    total_interrupts += m.get("interrupt_count", 0)
    total_guardrail_l2 += m.get("guardrail_level2_count", 0)
    total_guardrail_l3 += m.get("guardrail_level3_count", 0)

    # Cost
    crd = c.get("call_result_data") or {}
    cost = crd.get("cost_usd", 0) or 0
    if not cost:
        ct = c.get("cost_tokens") or {}
        cost = (ct.get("audio_input", 0) * 0.06 + ct.get("audio_output", 0) * 0.24
                + ct.get("text_input", 0) * 0.005 + ct.get("text_output", 0) * 0.02) / 1000
    total_cost_usd += cost

    tok = c.get("total_tokens") or 0
    total_tokens_sum += tok

    dur = c.get("duration_s")
    if dur and dur > 0:
        total_duration += dur
        n_with_duration += 1

# ── Stats ────────────────────────────────────────────────────────────────────

sa_st = fmt_stats(all_sa)
e2e_st = fmt_stats(all_sb_e2e)
stt_st = fmt_stats(all_sb_stt)
trans_st = fmt_stats(all_sb_trans)

# Scatter buckets
buckets = {"<=30": [], "31-60": [], "61-100": [], "100+": []}
for s in all_scatter:
    cl, lat = s["char_len"], s["latency_ms"]
    if cl <= 30: buckets["<=30"].append(lat)
    elif cl <= 60: buckets["31-60"].append(lat)
    elif cl <= 100: buckets["61-100"].append(lat)
    else: buckets["100+"].append(lat)

# ── Output ───────────────────────────────────────────────────────────────────

print()
print("=" * 64)
print("  WIGVO All Calls Report (Cumulative)")
print("=" * 64)

# ── Overview ──
print()
print("-" * 64)
print("  [Overview]")
print("-" * 64)
print(f"  Total calls:          {total_calls}")
print(f"  Instrumented (w/ metrics): {n_instrumented}")
print(f"  Connected calls:      {n_connected}")
print()
print("  Status:")
for s, cnt in status_counter.most_common():
    pct_v = cnt / total_calls * 100
    print(f"    {s:<15s} {cnt:>4d} ({pct_v:5.1f}%)")
print()
print("  Mode distribution:")
for m, cnt in mode_counter.most_common():
    pct_v = cnt / total_calls * 100
    print(f"    {m:<10s} {cnt:>4d} ({pct_v:5.1f}%)")

# ── Session A ──
print()
print("-" * 64)
print(f"  [Session A: Caller -> Recipient]  N={sa_st['n']} turns")
print("-" * 64)
if sa_st["n"]:
    print(f"  P50: {sa_st['p50']:.0f}ms  P95: {sa_st['p95']:.0f}ms  Mean: {sa_st['mean']:.0f}ms  Max: {sa_st['max']:.0f}ms")

# ── Session B ──
print()
print("-" * 64)
print(f"  [Session B: Recipient -> Caller]  N={e2e_st['n']} turns")
print("-" * 64)
if e2e_st["n"]:
    print(f"  E2E        P50: {e2e_st['p50']:.0f}ms  P95: {e2e_st['p95']:.0f}ms  Mean: {e2e_st['mean']:.0f}ms  Max: {e2e_st['max']:.0f}ms")
if stt_st["n"]:
    print(f"  STT        P50: {stt_st['p50']:.0f}ms  P95: {stt_st['p95']:.0f}ms  Mean: {stt_st['mean']:.0f}ms")
if trans_st["n"]:
    print(f"  Translate  P50: {trans_st['p50']:.0f}ms  P95: {trans_st['p95']:.0f}ms  Mean: {trans_st['mean']:.0f}ms")
if all_paired_e2e:
    paired_e2e_mean = sum(all_paired_e2e) / len(all_paired_e2e)
    paired_stt_mean = sum(all_paired_stt) / len(all_paired_stt)
    stt_pct = paired_stt_mean / paired_e2e_mean * 100 if paired_e2e_mean > 0 else 0
    print(f"  STT % of E2E mean: {stt_pct:.1f}%  (N={len(all_paired_e2e)} paired turns)")

# ── Utterance Analysis ──
print()
print("-" * 64)
print("  [Utterance Analysis]")
print("-" * 64)
if all_scatter:
    xs = [s["char_len"] for s in all_scatter]
    ys = [s["latency_ms"] for s in all_scatter]
    r = pearson_r(xs, ys)
    print(f"  Pearson r (char_len vs SB latency): {r:.3f}")
    print()
    print(f"  {'Range':>8s}   {'N':>3s}   {'Mean':>8s}")
    for label, vals in buckets.items():
        if vals:
            mean = sum(vals) / len(vals)
            print(f"  {label:>8s}   {len(vals):3d}   {mean:7.0f}ms")
        else:
            print(f"  {label:>8s}     0        -")
else:
    print("  (no scatter data)")

# ── Echo & VAD ──
print()
print("-" * 64)
print("  [Echo & VAD]")
print("-" * 64)
echo_per = total_echo_supp / n_instrumented if n_instrumented else 0
vad_per = total_vad_false / n_instrumented if n_instrumented else 0
print(f"  Echo gate activations:   {total_echo_supp:>4d} total  ({echo_per:.1f}/call)")
print(f"  Echo gate breakthroughs: {total_echo_breakthroughs:>4d}")
print(f"  Echo-induced loops:      {total_echo_loops:>4d} / {n_instrumented} calls")
print(f"  VAD false triggers:      {total_vad_false:>4d} total  ({vad_per:.1f}/call)")
print(f"  Hallucinations blocked:  {total_hallucinations:>4d}")
print(f"  Interrupts:              {total_interrupts:>4d}")
print(f"  Guardrail L2/L3:         {total_guardrail_l2}/{total_guardrail_l3}")

# ── Cost ──
print()
print("-" * 64)
print("  [Cost]")
print("-" * 64)
print(f"  Total tokens:    {total_tokens_sum:>10,d}")
print(f"  Total cost:      ${total_cost_usd:.4f}")
print(f"  Total duration:  {total_duration:.0f}s ({total_duration/60:.1f}min)")
if total_duration > 0:
    cpm = total_cost_usd / (total_duration / 60)
    print(f"  Cost per minute: ${cpm:.4f}")
if n_instrumented:
    print(f"  Avg cost/call:   ${total_cost_usd/n_instrumented:.4f}")

# ── Cumulative Summary ──
print()
print("=" * 64)
print("  [Cumulative Summary]")
print("=" * 64)
print(f"  Total instrumented calls: {n_instrumented}")
print(f"  Total connected calls:    {n_connected}")
print()
print("  Mode distribution:")
for m, cnt in mode_counter.most_common():
    pct_v = cnt / total_calls * 100
    print(f"    {m:<10s} {cnt:>4d} ({pct_v:.0f}%)")
print()
if sa_st["n"]:
    print(f"  SA  P50: {sa_st['p50']:.0f}ms  P95: {sa_st['p95']:.0f}ms  (N={sa_st['n']} turns)")
if e2e_st["n"]:
    print(f"  SB  P50: {e2e_st['p50']:.0f}ms  P95: {e2e_st['p95']:.0f}ms  (N={e2e_st['n']} turns)")
print(f"  Overall echo loops: {total_echo_loops} / {n_instrumented} calls")
print()
print("=" * 64)
PYEOF
