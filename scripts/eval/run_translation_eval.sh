#!/usr/bin/env bash
# run_translation_eval.sh — BLEU/chrF2++ 번역 품질 평가 (Gemini/GPT-4o reference)
# 의존성 설치 + compute_translation_quality.py 실행을 한 번에 처리
#
# Usage:
#   ./run_translation_eval.sh                          # Gemini, 최근 100건
#   ./run_translation_eval.sh --ref-model gpt4o        # GPT-4o reference
#   ./run_translation_eval.sh --limit 5                # 소규모 테스트
#   ./run_translation_eval.sh --call-id <uuid>         # 특정 통화
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

# ── .env 로드 ────────────────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

# ── 환경변수 검증 ─────────────────────────────────────────────────────────────
: "${SUPABASE_URL:?SUPABASE_URL is not set}"
: "${SUPABASE_SERVICE_ROLE_KEY:?SUPABASE_SERVICE_ROLE_KEY is not set}"

# ref-model 기본값에 따라 API 키 검증
REF_MODEL="gemini"
for arg in "$@"; do
  if [[ "$arg" == "gpt4o" ]]; then
    REF_MODEL="gpt4o"
  fi
done

if [[ "$REF_MODEL" == "gemini" ]]; then
  : "${GEMINI_API_KEY:?GEMINI_API_KEY is not set (needed for --ref-model gemini)}"
else
  : "${OPENAI_API_KEY:?OPENAI_API_KEY is not set (needed for --ref-model gpt4o)}"
fi

# ── 의존성 설치 ───────────────────────────────────────────────────────────────
echo "Installing dependencies..."
pip install -q -r "$SCRIPT_DIR/requirements-eval.txt"

# ── 기본 인자 설정 ────────────────────────────────────────────────────────────
# 인자가 없으면 --all --limit 100 기본값
HAS_TARGET=false
for arg in "$@"; do
  if [[ "$arg" == "--all" || "$arg" == "--call-id" ]]; then
    HAS_TARGET=true
  fi
done

if [[ "$HAS_TARGET" == "false" ]]; then
  set -- --all --limit 100 "$@"
fi

# ── 실행 ─────────────────────────────────────────────────────────────────────
echo "Running translation quality evaluation..."
echo ""
python "$SCRIPT_DIR/compute_translation_quality.py" "$@"
