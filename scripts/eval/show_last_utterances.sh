#!/usr/bin/env bash
# show_last_utterances.sh — 마지막 통화의 사용자 발화 조회 (transcript_bilingual)
# Usage: ./scripts/eval/show_last_utterances.sh [--all] [--limit N]
#   --all    모든 role 표시 (기본: user만)
#   --limit  조회할 통화 수 (기본: 1)
set -euo pipefail

# ── Args ──────────────────────────────────────────────────────────────────────
SHOW_ALL=false
LIMIT=1
while [[ $# -gt 0 ]]; do
  case "$1" in
    --all) SHOW_ALL=true; shift ;;
    --limit) LIMIT="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

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

# ── Fetch ────────────────────────────────────────────────────────────────────
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

curl -s "$API/calls?select=id,call_sid,status,source_language,target_language,communication_mode,call_mode,duration_s,transcript_bilingual,created_at&transcript_bilingual=not.is.null&order=created_at.desc&limit=$LIMIT" \
  "${AUTH_HEADERS[@]}" \
  -H "Accept: application/json" > "$TMPFILE"

# ── Process ──────────────────────────────────────────────────────────────────
python3 - "$TMPFILE" "$SHOW_ALL" << 'PYEOF'
import json, sys
from datetime import datetime

with open(sys.argv[1]) as f:
    data = json.load(f)

show_all = sys.argv[2] == "true"

if not data:
    print("No calls with transcript_bilingual found.")
    sys.exit(0)

ROLE_COLORS = {
    "user": "\033[36m",       # cyan
    "assistant": "\033[33m",  # yellow
    "recipient": "\033[32m",  # green
}
RESET = "\033[0m"
BOLD = "\033[1m"
DIM = "\033[2m"

for call in data:
    transcripts = call.get("transcript_bilingual") or []
    if not transcripts:
        continue

    created = (call.get("created_at") or "?")[:19]
    langs = f"{call.get('source_language', '?')} -> {call.get('target_language', '?')}"
    mode = call.get("call_mode") or "?"
    comm = call.get("communication_mode") or "?"
    dur = call.get("duration_s")
    dur_str = f"{dur:.0f}s" if dur else "N/A"

    print()
    print(f"{BOLD}{'=' * 64}{RESET}")
    print(f"{BOLD}  Call: {call['id'][:8]}...  {created}  {langs}  {mode}/{comm}  {dur_str}{RESET}")
    print(f"{'=' * 64}")

    entries = transcripts if show_all else [t for t in transcripts if t.get("role") == "user"]

    if not entries:
        print(f"  {DIM}(no user utterances){RESET}")
        continue

    for i, t in enumerate(entries, 1):
        role = t.get("role", "?")
        color = ROLE_COLORS.get(role, "")
        original = t.get("original_text", "")
        translated = t.get("translated_text", "")
        lang = t.get("language", "")
        ts = t.get("timestamp")

        ts_str = ""
        if ts:
            try:
                dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                ts_str = dt.strftime("%H:%M:%S")
            except (ValueError, AttributeError):
                ts_str = str(ts)[:8]

        print()
        print(f"  {DIM}{ts_str}{RESET}  {color}[{role}]{RESET}  {DIM}({lang}){RESET}")
        print(f"    {original}")
        if translated:
            print(f"    {DIM}-> {translated}{RESET}")

    user_count = len([t for t in transcripts if t.get("role") == "user"])
    recip_count = len([t for t in transcripts if t.get("role") == "recipient"])
    ai_count = len([t for t in transcripts if t.get("role") == "assistant"])
    total = len(transcripts)

    print()
    print(f"  {DIM}Total: {total} utterances (user: {user_count}, recipient: {recip_count}, ai: {ai_count}){RESET}")
    print()

PYEOF
