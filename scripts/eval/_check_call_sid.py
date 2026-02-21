#!/usr/bin/env python3
"""call_sid 있지만 metrics 없는 통화 목록 출력.

Usage:
    cd apps/relay-server
    uv run python ../../scripts/eval/_check_call_sid.py
"""
from __future__ import annotations

import os
import sys


def main() -> None:
    try:
        from supabase import create_client
    except ImportError:
        print("ERROR: supabase 패키지 필요: pip install supabase", file=sys.stderr)
        sys.exit(1)

    url = os.environ.get("SUPABASE_URL")
    key = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
           or os.environ.get("SUPABASE_SERVICE_KEY")
           or os.environ.get("SUPABASE_KEY"))
    if not url or not key:
        print("ERROR: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요", file=sys.stderr)
        sys.exit(1)

    client = create_client(url, key)
    all_calls = client.table("calls").select("*").order("created_at", desc=True).limit(1000).execute().data
    has_sid = [c for c in all_calls if c.get("call_sid")]

    sid_no_metrics = []
    for c in has_sid:
        crd = c.get("call_result_data") or {}
        if not crd.get("metrics"):
            sid_no_metrics.append(c)

    print(f"call_sid 있고 metrics 없는 통화: {len(sid_no_metrics)}건\n")
    for c in sid_no_metrics:
        print(
            f"{c['id']}  status={c.get('status', '?'):<12} "
            f"mode={c.get('communication_mode', '?'):<16} "
            f"created={str(c.get('created_at', '?'))[:19]}  "
            f"dur={c.get('duration_s')}"
        )


if __name__ == "__main__":
    main()
