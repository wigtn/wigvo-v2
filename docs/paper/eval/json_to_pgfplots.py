#!/usr/bin/env python3
"""Convert paper_metrics JSON to pgfplots-compatible CSV + meta.tex.

Output files (in docs/paper/data/):
  - figure3_sa_hist.csv   : Session A histogram bins (bin_center, count)
  - figure3_sb_hist.csv   : Session B histogram bins (bin_center, count)
  - figure4_scatter.csv   : char_len, latency_ms scatter data
  - figure4_meta.tex      : \\def macros for both figures

Usage:
    python docs/paper/eval/json_to_pgfplots.py                          # uses default paper_metrics.json
    python docs/paper/eval/json_to_pgfplots.py --input data/recent.json # custom input
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_DATA_DIR = _SCRIPT_DIR.parent / "data"

# Number of histogram bins
HIST_BINS = 15


def _histogram(values: list[float], bins: int, lo: float, hi: float) -> list[tuple[float, int]]:
    """Return (bin_center, count) pairs for evenly spaced bins."""
    width = (hi - lo) / bins
    counts = [0] * bins
    for v in values:
        idx = min(int((v - lo) / width), bins - 1)
        if idx < 0:
            idx = 0
        counts[idx] += 1
    return [(round(lo + (i + 0.5) * width, 1), counts[i]) for i in range(bins)]


def _pearson(x: list[float], y: list[float]) -> float:
    n = len(x)
    if n < 2:
        return 0.0
    mx, my = sum(x) / n, sum(y) / n
    cov = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    sx = sum((xi - mx) ** 2 for xi in x) ** 0.5
    sy = sum((yi - my) ** 2 for yi in y) ** 0.5
    if sx == 0 or sy == 0:
        return 0.0
    return cov / (sx * sy)


def _linreg(x: list[float], y: list[float]) -> tuple[float, float]:
    """Simple linear regression -> (slope, intercept)."""
    n = len(x)
    mx, my = sum(x) / n, sum(y) / n
    ss_xy = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    ss_xx = sum((xi - mx) ** 2 for xi in x)
    if ss_xx == 0:
        return 0.0, my
    slope = ss_xy / ss_xx
    intercept = my - slope * mx
    return slope, intercept


def _pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    k = (len(s) - 1) * (p / 100)
    f, c = math.floor(k), math.ceil(k)
    if f == c:
        return s[int(k)]
    return s[f] * (c - k) + s[c] * (k - f)


def _p_value_from_r(r: float, n: int) -> str:
    """Approximate p-value string from Pearson r and sample size."""
    if n <= 2 or abs(r) >= 1.0:
        return "p < 0.001"
    t_stat = r * math.sqrt((n - 2) / (1 - r * r))
    # For large t_stat, p is very small
    if abs(t_stat) > 3.5:
        return "p < 0.001"
    if abs(t_stat) > 2.5:
        return "p < 0.01"
    return f"p = {0.05:.3f}"  # conservative fallback


def _se_regression(x: list[float], y: list[float], slope: float, intercept: float) -> float:
    """Standard error of the regression."""
    n = len(x)
    if n <= 2:
        return 0.0
    ss_res = sum((yi - (slope * xi + intercept)) ** 2 for xi, yi in zip(x, y))
    return math.sqrt(ss_res / (n - 2))


def convert(input_path: Path) -> None:
    with open(input_path) as f:
        data = json.load(f)

    _DATA_DIR.mkdir(parents=True, exist_ok=True)

    sa = data["session_a"]
    sb = data["session_b"]

    # ── Figure 3: Histograms ────────────────────────────────────
    sa_raw = sa.get("latency_raw", [])
    sb_raw = sb.get("e2e_latency_raw", [])

    # Session A: 0 ~ max(raw) rounded up
    sa_hi = max(sa_raw) if sa_raw else 2500
    sa_hi = math.ceil(sa_hi / 100) * 100  # round to nearest 100
    sa_bins = _histogram(sa_raw, HIST_BINS, 0, sa_hi)

    # Session B: 0 ~ max(raw) rounded up
    sb_hi = max(sb_raw) if sb_raw else 11000
    sb_hi = math.ceil(sb_hi / 1000) * 1000  # round to nearest 1000
    sb_bins = _histogram(sb_raw, HIST_BINS, 0, sb_hi)

    for fname, bins in [("figure3_sa_hist.csv", sa_bins), ("figure3_sb_hist.csv", sb_bins)]:
        path = _DATA_DIR / fname
        with open(path, "w") as f:
            f.write("bin_center,count\n")
            for center, count in bins:
                f.write(f"{center},{count}\n")
        print(f"  Wrote {path}")

    # ── Figure 4: Scatter ───────────────────────────────────────
    scatter = sb.get("length_vs_latency", {}).get("scatter", [])
    xs = [d["char_len"] for d in scatter]
    ys = [d["latency_ms"] for d in scatter]

    path = _DATA_DIR / "figure4_scatter.csv"
    with open(path, "w") as f:
        f.write("char_len,latency_ms\n")
        for d in scatter:
            f.write(f"{d['char_len']},{d['latency_ms']}\n")
    print(f"  Wrote {path}")

    # ── Meta macros ─────────────────────────────────────────────
    sa_stats = sa["latency_ms"]
    sb_stats = sb["e2e_latency_ms"]

    slope, intercept = _linreg(xs, ys) if len(xs) >= 2 else (0, 0)
    r = _pearson(xs, ys) if len(xs) >= 2 else 0
    p_str = _p_value_from_r(r, len(xs))
    se = _se_regression(xs, ys, slope, intercept) if len(xs) >= 2 else 0

    # CI half-widths at x=0 and x=130 for fill-between
    n = len(xs)
    x_mean = sum(xs) / n if n > 0 else 0
    ss_xx = sum((xi - x_mean) ** 2 for xi in xs) if n > 0 else 1

    # Compute bar width for histograms (for pgfplots)
    sa_bar_width = round(sa_hi / HIST_BINS, 1)
    sb_bar_width = round(sb_hi / HIST_BINS, 1)

    path = _DATA_DIR / "figure4_meta.tex"
    with open(path, "w") as f:
        f.write("% Auto-generated by json_to_pgfplots.py -- do not edit\n")
        f.write("% Figure 3 — Session A\n")
        f.write(f"\\def\\FigThreeSAN{{{sa_stats['n']}}}\n")
        f.write(f"\\def\\FigThreeSAMean{{{round(sa_stats['mean'])}}}\n")
        f.write(f"\\def\\FigThreeSAStd{{{round(sa_stats['std'])}}}\n")
        f.write(f"\\def\\FigThreeSAMedian{{{round(sa_stats['p50'])}}}\n")
        f.write(f"\\def\\FigThreeSAPNF{{{round(sa_stats['p95'])}}}\n")
        f.write(f"\\def\\FigThreeSAMax{{{round(sa_hi)}}}\n")
        f.write(f"\\def\\FigThreeSABarW{{{sa_bar_width}}}\n")
        f.write("% Figure 3 — Session B\n")
        f.write(f"\\def\\FigThreeSBN{{{sb_stats['n']}}}\n")
        f.write(f"\\def\\FigThreeSBMean{{{round(sb_stats['mean'])}}}\n")
        f.write(f"\\def\\FigThreeSBStd{{{round(sb_stats['std'])}}}\n")
        f.write(f"\\def\\FigThreeSBMedian{{{round(sb_stats['p50'])}}}\n")
        f.write(f"\\def\\FigThreeSBPNF{{{round(sb_stats['p95'])}}}\n")
        f.write(f"\\def\\FigThreeSBMax{{{round(sb_hi)}}}\n")
        f.write(f"\\def\\FigThreeSBBarW{{{sb_bar_width}}}\n")
        f.write("% Figure 4 — Scatter\n")
        f.write(f"\\def\\FigFourN{{{len(xs)}}}\n")
        f.write(f"\\def\\FigFourSlope{{{slope:.1f}}}\n")
        f.write(f"\\def\\FigFourIntercept{{{intercept:.1f}}}\n")
        f.write(f"\\def\\FigFourPearsonR{{{r:.3f}}}\n")
        f.write(f"\\def\\FigFourPValue{{{p_str}}}\n")
        f.write(f"\\def\\FigFourSE{{{se:.1f}}}\n")
        f.write(f"\\def\\FigFourXMean{{{x_mean:.1f}}}\n")
        f.write(f"\\def\\FigFourSSXX{{{ss_xx:.1f}}}\n")
    print(f"  Wrote {path}")

    print(f"\nSummary:")
    print(f"  Session A: N={sa_stats['n']}, P50={sa_stats['p50']}ms, P95={sa_stats['p95']}ms")
    print(f"  Session B: N={sb_stats['n']}, P50={sb_stats['p50']}ms, P95={sb_stats['p95']}ms")
    print(f"  Scatter:   N={len(xs)}, slope={slope:.1f}, r={r:.3f}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert paper_metrics JSON to pgfplots CSV/tex")
    default_input = Path(__file__).resolve().parent.parent.parent.parent / "scripts" / "eval" / "paper_metrics.json"
    parser.add_argument("--input", default=str(default_input), help="Input JSON path")
    args = parser.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"ERROR: {input_path} not found", file=sys.stderr)
        sys.exit(1)

    print(f"Input:  {input_path}")
    print(f"Output: {_DATA_DIR}/\n")
    convert(input_path)


if __name__ == "__main__":
    main()
