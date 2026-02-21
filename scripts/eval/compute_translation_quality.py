#!/usr/bin/env python3
"""WIGVO 번역 품질 오프라인 평가 스크립트.

Supabase에서 transcript_bilingual (원문, 번역) 쌍을 가져와
GPT-4o reference 번역 대비 BLEU/chrF2++ 점수를 계산한다.

논문 활용: 실시간 번역 품질을 오프라인(제약 없는) 번역 대비로 측정하여
latency-quality tradeoff 입증 (Huber et al. 2023 방법론).

Usage:
    pip install -r requirements-eval.txt
    python compute_translation_quality.py --call-id <call_id>
    python compute_translation_quality.py --all --limit 10
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, field

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


@dataclass
class TranslationPair:
    """원문-번역 쌍."""
    role: str           # "user" | "recipient"
    original: str       # STT 원문 (source language)
    hypothesis: str     # 실시간 번역 출력
    reference: str = "" # GPT-4o 오프라인 번역 (나중에 채움)
    direction: str = "" # e.g. "en→ko" or "ko→en"


@dataclass
class EvalResult:
    """평가 결과."""
    direction: str
    num_segments: int = 0
    bleu: float = 0.0
    chrf: float = 0.0
    pairs: list[TranslationPair] = field(default_factory=list)


def fetch_transcripts(call_id: str | None = None, limit: int = 10) -> list[dict]:
    """Supabase에서 transcript_bilingual을 조회한다."""
    try:
        from supabase import create_client
    except ImportError:
        logger.error("supabase 패키지가 필요합니다: pip install supabase")
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY")
    if not url or not key:
        logger.error("SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다")
        sys.exit(1)

    client = create_client(url, key)

    query = client.table("calls").select("call_id, call_result_data, source_language, target_language")
    if call_id:
        query = query.eq("call_id", call_id)
    else:
        query = query.not_.is_("call_result_data", "null").order("created_at", desc=True).limit(limit)

    result = query.execute()
    return result.data


def extract_pairs(calls: list[dict]) -> tuple[list[TranslationPair], list[TranslationPair]]:
    """통화 데이터에서 (원문 != 번역)인 쌍만 추출한다.

    Returns:
        (user_pairs, recipient_pairs) — 방향별 분리
    """
    user_pairs: list[TranslationPair] = []
    recipient_pairs: list[TranslationPair] = []

    for call in calls:
        src_lang = call.get("source_language", "en")
        tgt_lang = call.get("target_language", "ko")
        result_data = call.get("call_result_data", {})
        if not result_data:
            continue

        # call_result_data에 저장된 transcript를 먼저 확인
        # (persist_call에서 metrics와 함께 저장되므로)
        transcripts = result_data.get("transcripts", [])
        if not transcripts:
            # fallback: call_result_data 내의 다른 구조 탐색
            continue

        for entry in transcripts:
            original = entry.get("original_text", "")
            translated = entry.get("translated_text", "")
            role = entry.get("role", "")

            # 원문과 번역이 동일하면 스킵 (기존 버그 데이터)
            if not original or not translated or original == translated:
                continue

            if role == "user":
                user_pairs.append(TranslationPair(
                    role=role,
                    original=original,
                    hypothesis=translated,
                    direction=f"{src_lang}→{tgt_lang}",
                ))
            elif role == "recipient":
                recipient_pairs.append(TranslationPair(
                    role=role,
                    original=original,
                    hypothesis=translated,
                    direction=f"{tgt_lang}→{src_lang}",
                ))

    return user_pairs, recipient_pairs


def generate_references(pairs: list[TranslationPair], src_lang: str, tgt_lang: str) -> None:
    """GPT-4o text API로 reference 번역을 생성한다."""
    try:
        from openai import OpenAI
    except ImportError:
        logger.error("openai 패키지가 필요합니다: pip install openai")
        sys.exit(1)

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        logger.error("OPENAI_API_KEY 환경변수가 필요합니다")
        sys.exit(1)

    client = OpenAI(api_key=api_key)

    for i, pair in enumerate(pairs):
        logger.info("Generating reference [%d/%d]: %s", i + 1, len(pairs), pair.original[:50])
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": (
                        f"You are a professional translator. Translate the following text from "
                        f"{src_lang} to {tgt_lang}. Output ONLY the translated text, nothing else."
                    ),
                },
                {"role": "user", "content": pair.original},
            ],
            temperature=0.0,
            max_tokens=1024,
        )
        pair.reference = response.choices[0].message.content.strip()


def compute_scores(pairs: list[TranslationPair]) -> EvalResult:
    """SacreBLEU로 BLEU + chrF2++ 점수를 계산한다."""
    try:
        import sacrebleu
    except ImportError:
        logger.error("sacrebleu 패키지가 필요합니다: pip install sacrebleu")
        sys.exit(1)

    if not pairs:
        return EvalResult(direction="N/A", num_segments=0)

    hypotheses = [p.hypothesis for p in pairs]
    references = [[p.reference for p in pairs]]

    bleu = sacrebleu.corpus_bleu(hypotheses, references)
    chrf = sacrebleu.corpus_chrf(hypotheses, references, word_order=2)  # chrF2++

    return EvalResult(
        direction=pairs[0].direction,
        num_segments=len(pairs),
        bleu=bleu.score,
        chrf=chrf.score,
        pairs=pairs,
    )


def print_results(results: list[EvalResult]) -> None:
    """결과를 테이블 형식으로 출력한다."""
    print("\n" + "=" * 70)
    print("WIGVO Translation Quality Evaluation")
    print("=" * 70)

    for r in results:
        if r.num_segments == 0:
            continue
        print(f"\nDirection: {r.direction} ({r.num_segments} segments)")
        print(f"  BLEU:     {r.bleu:.1f}")
        print(f"  chrF2++:  {r.chrf:.1f}")

    # LaTeX 테이블
    print("\n--- LaTeX Table ---")
    print(r"\begin{tabular}{lrrr}")
    print(r"\hline")
    print(r"Direction & Segments & BLEU & chrF2++ \\")
    print(r"\hline")
    for r in results:
        if r.num_segments == 0:
            continue
        print(f"{r.direction} & {r.num_segments} & {r.bleu:.1f} & {r.chrf:.1f} \\\\")
    print(r"\hline")
    print(r"\end{tabular}")

    # 샘플 출력
    for r in results:
        if r.num_segments == 0:
            continue
        print(f"\n--- Sample pairs ({r.direction}) ---")
        for p in r.pairs[:3]:
            print(f"  Original:   {p.original[:80]}")
            print(f"  Hypothesis: {p.hypothesis[:80]}")
            print(f"  Reference:  {p.reference[:80]}")
            print()


def save_results(results: list[EvalResult], output_path: str) -> None:
    """결과를 JSON으로 저장한다."""
    data = []
    for r in results:
        data.append({
            "direction": r.direction,
            "num_segments": r.num_segments,
            "bleu": round(r.bleu, 2),
            "chrf": round(r.chrf, 2),
            "pairs": [
                {
                    "original": p.original,
                    "hypothesis": p.hypothesis,
                    "reference": p.reference,
                }
                for p in r.pairs
            ],
        })
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info("Results saved to %s", output_path)


def main() -> None:
    parser = argparse.ArgumentParser(description="WIGVO 번역 품질 평가")
    parser.add_argument("--call-id", help="특정 통화 ID로 평가")
    parser.add_argument("--all", action="store_true", help="최근 N개 통화 전체 평가")
    parser.add_argument("--limit", type=int, default=10, help="--all 시 최대 통화 수")
    parser.add_argument("--output", default="eval_results.json", help="결과 저장 경로")
    parser.add_argument("--skip-reference", action="store_true",
                        help="GPT-4o reference 생성 스킵 (기존 reference가 있는 경우)")
    args = parser.parse_args()

    if not args.call_id and not args.all:
        parser.print_help()
        print("\n--call-id 또는 --all 중 하나를 지정하세요.")
        sys.exit(1)

    # 1. Supabase에서 transcript 조회
    logger.info("Fetching transcripts from Supabase...")
    calls = fetch_transcripts(call_id=args.call_id, limit=args.limit)
    if not calls:
        logger.error("No calls found")
        sys.exit(1)
    logger.info("Found %d calls", len(calls))

    # 2. (원문 != 번역)인 쌍 추출
    user_pairs, recipient_pairs = extract_pairs(calls)
    logger.info("Extracted %d user pairs, %d recipient pairs", len(user_pairs), len(recipient_pairs))

    if not user_pairs and not recipient_pairs:
        logger.error("No valid translation pairs found (original_text == translated_text?)")
        logger.info("Ensure transcript_bilingual has separate original/translated values.")
        sys.exit(1)

    # 3. GPT-4o reference 번역 생성
    if not args.skip_reference:
        if user_pairs:
            src = calls[0].get("source_language", "en")
            tgt = calls[0].get("target_language", "ko")
            logger.info("Generating references for user pairs (%s→%s)...", src, tgt)
            generate_references(user_pairs, src, tgt)

        if recipient_pairs:
            src = calls[0].get("source_language", "en")
            tgt = calls[0].get("target_language", "ko")
            logger.info("Generating references for recipient pairs (%s→%s)...", tgt, src)
            generate_references(recipient_pairs, tgt, src)

    # 4. BLEU/chrF2++ 계산
    results = []
    if user_pairs:
        results.append(compute_scores(user_pairs))
    if recipient_pairs:
        results.append(compute_scores(recipient_pairs))

    # 5. 결과 출력 + 저장
    print_results(results)
    save_results(results, args.output)


if __name__ == "__main__":
    main()
