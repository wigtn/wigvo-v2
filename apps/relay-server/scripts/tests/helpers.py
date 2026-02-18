"""공유 유틸리티: ANSI 색상, 결과 출력."""

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"


def ok(msg: str) -> None:
    print(f"  {GREEN}\u2713{RESET} {msg}")


def fail(msg: str) -> None:
    print(f"  {RED}\u2717{RESET} {msg}")


def info(msg: str) -> None:
    print(f"  {CYAN}\u2192{RESET} {msg}")


def header(title: str) -> None:
    print(f"\n{BOLD}{YELLOW}\u2550\u2550\u2550 {title} \u2550\u2550\u2550{RESET}")


def print_summary(results: list[tuple[str, bool]]) -> None:
    """테스트 결과 요약 출력."""
    header("결과 요약")
    passed = sum(1 for _, ok in results if ok)
    total = len(results)

    for name, ok_flag in results:
        icon = f"{GREEN}\u2713{RESET}" if ok_flag else f"{RED}\u2717{RESET}"
        print(f"  {icon} {name}")

    print()
    if passed == total:
        print(f"  {GREEN}{BOLD}\u2713 {passed}/{total} 테스트 통과{RESET}")
    else:
        print(f"  {RED}{BOLD}\u2717 {passed}/{total} 테스트 통과{RESET}")
    print()
